use crate::models::{CropRect, EditDocument, Layout, VisualLayer};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Easing {
    #[default]
    Linear,
    EaseIn,
    EaseOut,
    Smooth,
    Hold,
    Curve {
        first: f64,
        second: f64,
    },
}

impl Easing {
    fn controls(&self) -> (f64, f64) {
        match self {
            Self::Linear => (1.0 / 3.0, 2.0 / 3.0),
            Self::EaseIn => (0.0, 0.0),
            Self::EaseOut => (1.0, 1.0),
            Self::Smooth => (0.0, 1.0),
            Self::Curve { first, second } => (*first, *second),
            Self::Hold => (0.0, 0.0),
        }
    }

    fn validate(&self) -> Result<(), String> {
        let (first, second) = self.controls();
        if !first.is_finite()
            || !second.is_finite()
            || !(0.0..=1.0).contains(&first)
            || !(first..=1.0).contains(&second)
        {
            return Err("Motion easing controls must be finite, ordered, and normalized.".into());
        }
        Ok(())
    }

    fn polynomial(&self) -> [f64; 4] {
        if matches!(self, Self::Hold) {
            return [0.0; 4];
        }
        let (first, second) = self.controls();
        [
            0.0,
            3.0 * first,
            3.0 * (second - 2.0 * first),
            1.0 + 3.0 * (first - second),
        ]
    }

    fn restricted(&self, from: f64, to: f64) -> Self {
        // Keep the same cubic trajectory when a scene trims away part of its easing interval.
        if matches!(self, Self::Hold) {
            return Self::Hold;
        }
        let coefficients = self.polynomial();
        let start = evaluate(coefficients, from);
        let end = evaluate(coefficients, to);
        if (end - start).abs() < 1e-12 {
            return Self::Linear;
        }
        let derivative = |time| {
            coefficients[1] + 2.0 * coefficients[2] * time + 3.0 * coefficients[3] * time * time
        };
        let first = ((to - from) * derivative(from) / (3.0 * (end - start))).clamp(0.0, 1.0);
        let second = (1.0 - (to - from) * derivative(to) / (3.0 * (end - start))).clamp(first, 1.0);
        Self::Curve { first, second }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CameraKeyframe {
    pub time_ms: i64,
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
    #[serde(default)]
    pub easing: Easing,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct LayerKeyframe {
    pub time_ms: i64,
    pub x: f64,
    pub y: f64,
    pub scale: f64,
    pub opacity: f64,
    #[serde(default)]
    pub easing: Easing,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MotionInterval {
    pub start_ms: i64,
    pub end_ms: i64,
    pub coefficients: Vec<[f64; 4]>,
    #[serde(skip)]
    easing: Easing,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MotionCurve {
    pub initial: Vec<f64>,
    pub final_values: Vec<f64>,
    pub intervals: Vec<MotionInterval>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct CameraMotionPlan {
    pub curve: MotionCurve,
    pub base_width: f64,
    pub base_height: f64,
}

fn evaluate(coefficients: [f64; 4], progress: f64) -> f64 {
    coefficients[0]
        + progress * (coefficients[1] + progress * (coefficients[2] + progress * coefficients[3]))
}

impl MotionCurve {
    fn compile(initial: Vec<f64>, start: i64, anchors: Vec<(i64, Vec<f64>, Easing)>) -> Self {
        let mut previous = (start, initial.clone());
        let mut curve = Self {
            initial: initial.clone(),
            final_values: initial,
            intervals: Vec::new(),
        };
        for (time, values, easing) in anchors {
            if time > previous.0 {
                let polynomial = easing.polynomial();
                let coefficients = previous
                    .1
                    .iter()
                    .zip(&values)
                    .map(|(from, to)| {
                        let difference = to - from;
                        [
                            *from,
                            polynomial[1] * difference,
                            polynomial[2] * difference,
                            polynomial[3] * difference,
                        ]
                    })
                    .collect();
                curve.intervals.push(MotionInterval {
                    start_ms: previous.0,
                    end_ms: time,
                    coefficients,
                    easing,
                });
            } else {
                curve.initial = values.clone();
            }
            previous = (time, values.clone());
            curve.final_values = values;
        }
        curve
    }

    pub fn at(&self, time_ms: f64) -> Vec<f64> {
        for interval in &self.intervals {
            if time_ms < interval.start_ms as f64 {
                return self.initial.clone();
            }
            if time_ms < interval.end_ms as f64 {
                let progress = ((time_ms - interval.start_ms as f64)
                    / (interval.end_ms - interval.start_ms) as f64)
                    .clamp(0.0, 1.0);
                return interval
                    .coefficients
                    .iter()
                    .map(|coefficients| evaluate(*coefficients, progress))
                    .collect();
            }
        }
        self.final_values.clone()
    }

    pub fn expression(&self, component: usize, time: &str) -> String {
        if self.intervals.is_empty() {
            return format!("{:.10}", self.final_values[component]);
        }
        let start = self.intervals[0].start_ms;
        let end = self.intervals.last().unwrap().end_ms;
        format!(
            "if(lt({time},{start}),{:.10},if(gte({time},{end}),{:.10},{}))",
            self.initial[component],
            self.final_values[component],
            interval_expression(&self.intervals, component, time)
        )
    }

    fn fragment(&self, from: i64, to: i64, target: i64) -> Vec<(i64, Vec<f64>, Easing)> {
        let mut points = vec![(target, self.at(from as f64), Easing::Hold)];
        let mut previous = from;
        for interval in &self.intervals {
            let end = interval.end_ms.min(to);
            if end <= previous {
                continue;
            }
            let length = (interval.end_ms - interval.start_ms) as f64;
            let start_fraction = ((previous - interval.start_ms) as f64 / length).clamp(0.0, 1.0);
            let end_fraction = ((end - interval.start_ms) as f64 / length).clamp(0.0, 1.0);
            points.push((
                target + end - from,
                self.at(end as f64),
                interval.easing.restricted(start_fraction, end_fraction),
            ));
            previous = end;
        }
        if previous < to {
            points.push((target + to - from, self.at(to as f64), Easing::Hold));
        }
        points
    }
}

fn interval_expression(intervals: &[MotionInterval], component: usize, time: &str) -> String {
    if intervals.len() == 1 {
        let interval = &intervals[0];
        let coefficients = interval.coefficients[component];
        let progress = format!(
            "max(0,min(1,(({time})-{})/{}))",
            interval.start_ms,
            interval.end_ms - interval.start_ms
        );
        return format!(
            "{:.10}+({:.10}+({:.10}+{:.10}*({progress}))*({progress}))*({progress})",
            coefficients[0], coefficients[1], coefficients[2], coefficients[3]
        );
    }
    let middle = intervals.len() / 2;
    format!(
        "if(lt({time},{}),{},{} )",
        intervals[middle].start_ms,
        interval_expression(&intervals[..middle], component, time),
        interval_expression(&intervals[middle..], component, time)
    )
}

pub fn camera_curve(document: &EditDocument) -> MotionCurve {
    MotionCurve::compile(
        vec![
            document.crop.x + document.crop.width / 2.0,
            document.crop.y + document.crop.height / 2.0,
            1.0,
        ],
        0,
        document
            .camera_motion
            .iter()
            .map(|key| {
                (
                    key.time_ms,
                    vec![key.x, key.y, key.zoom],
                    key.easing.clone(),
                )
            })
            .collect(),
    )
}

pub fn layer_curve(layer: &VisualLayer) -> MotionCurve {
    let (x, y) = if layer.kind == "broll" {
        (0.5, 0.5)
    } else {
        (layer.x, layer.y)
    };
    MotionCurve::compile(
        vec![x, y, 1.0, 1.0],
        layer.start_ms,
        layer
            .motion
            .iter()
            .map(|key| {
                (
                    key.time_ms,
                    vec![key.x, key.y, key.scale, key.opacity],
                    key.easing.clone(),
                )
            })
            .collect(),
    )
}

pub fn camera_rect(
    document: &EditDocument,
    time_ms: f64,
    source_width: u32,
    source_height: u32,
) -> CropRect {
    let plan = camera_plan(document, source_width, source_height);
    let values = plan.curve.at(time_ms);
    let crop_width = plan.base_width / values[2];
    let crop_height = plan.base_height / values[2];
    CropRect {
        x: (values[0] - crop_width / 2.0).clamp(0.0, 1.0 - crop_width),
        y: (values[1] - crop_height / 2.0).clamp(0.0, 1.0 - crop_height),
        width: crop_width,
        height: crop_height,
    }
}

pub fn camera_plan(
    document: &EditDocument,
    source_width: u32,
    source_height: u32,
) -> CameraMotionPlan {
    let (width, height) = document.layout.dimensions(document.resolution);
    let aspect = width as f64 / height as f64;
    let source_aspect = source_width as f64 / source_height as f64;
    let crop_width = document
        .crop
        .width
        .min(document.crop.height * aspect / source_aspect);
    let crop_height = crop_width * source_aspect / aspect;
    CameraMotionPlan {
        curve: camera_curve(document),
        base_width: crop_width,
        base_height: crop_height,
    }
}

pub fn remap_camera(document: &EditDocument, target: &EditDocument) -> Vec<CameraKeyframe> {
    let curve = camera_curve(document);
    let mut output = Vec::new();
    let mut offset = 0;
    for segment in target.source_segments() {
        if let Some(start) = document.source_to_content(segment.start_ms) {
            let end = document
                .source_to_content(segment.end_ms - 1)
                .unwrap_or(start);
            output.extend(curve.fragment(start, end, offset).into_iter().map(
                |(time_ms, values, easing)| CameraKeyframe {
                    time_ms,
                    x: values[0],
                    y: values[1],
                    zoom: values[2],
                    easing,
                },
            ));
        }
        offset += segment.end_ms - segment.start_ms;
    }
    output
}

pub fn remap_layer(layer: &VisualLayer, from: i64, to: i64, target: i64) -> Vec<LayerKeyframe> {
    layer_curve(layer)
        .fragment(from, to, target)
        .into_iter()
        .map(|(time_ms, values, easing)| LayerKeyframe {
            time_ms,
            x: values[0],
            y: values[1],
            scale: values[2],
            opacity: values[3],
            easing,
        })
        .collect()
}

pub fn validate(document: &EditDocument) -> Result<(), String> {
    if document.version < 4
        && (!document.camera_motion.is_empty()
            || document
                .visual_layers
                .iter()
                .any(|layer| !layer.motion.is_empty()))
    {
        return Err("Motion tracks require document version 4.".into());
    }
    if document.camera_motion.len() > 512 {
        return Err("Camera motion supports up to 512 anchors.".into());
    }
    if !document.camera_motion.is_empty() && !document.keyframes.is_empty() {
        return Err("Choose either camera motion or legacy crop keyframes.".into());
    }
    if !document.camera_motion.is_empty()
        && ![Layout::Portrait, Layout::Square, Layout::Landscape].contains(&document.layout)
    {
        return Err(
            "Camera motion currently requires portrait, square, or landscape framing.".into(),
        );
    }
    let mut previous = -1;
    for key in &document.camera_motion {
        key.easing.validate()?;
        if key.time_ms <= previous
            || key.time_ms > document.duration_ms()
            || !normalized(key.x)
            || !normalized(key.y)
            || !key.zoom.is_finite()
            || !(1.0..=4.0).contains(&key.zoom)
        {
            return Err("Camera anchors need ordered content times, normalized centers, and zoom from 1 to 4.".into());
        }
        previous = key.time_ms;
    }
    for layer in &document.visual_layers {
        let media = layer.kind == "broll";
        let maximum = if media { 24 } else { 256 };
        let minimum_scale = if media { 1.0 } else { 0.1 };
        if layer.motion.len() > maximum {
            return Err(format!(
                "This layer supports up to {maximum} motion anchors."
            ));
        }
        if !layer.motion.is_empty() && !["text", "note", "broll"].contains(&layer.kind.as_str()) {
            return Err("Motion is available on text, note, and B-roll layers.".into());
        }
        if !layer.motion.is_empty() && layer.end_ms - layer.start_ms > 120_000 {
            return Err("Animated layers must be at most 120 seconds long.".into());
        }
        let mut previous = layer.start_ms - 1;
        for key in &layer.motion {
            key.easing.validate()?;
            if key.time_ms <= previous
                || key.time_ms > layer.end_ms
                || !normalized(key.x)
                || !normalized(key.y)
                || !normalized(key.opacity)
                || !key.scale.is_finite()
                || !(minimum_scale..=4.0).contains(&key.scale)
            {
                return Err("Layer motion needs ordered layer times and valid transforms.".into());
            }
            previous = key.time_ms;
        }
    }
    Ok(())
}

fn normalized(value: f64) -> bool {
    value.is_finite() && (0.0..=1.0).contains(&value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hold_steps_at_the_anchor_and_easing_has_distinct_midpoints() {
        let hold = MotionCurve::compile(vec![0.0], 0, vec![(1000, vec![1.0], Easing::Hold)]);
        assert_eq!(hold.at(999.0), vec![0.0]);
        assert_eq!(hold.at(1000.0), vec![1.0]);
        for (easing, expected) in [
            (Easing::Linear, 0.5),
            (Easing::EaseIn, 0.125),
            (Easing::EaseOut, 0.875),
            (Easing::Smooth, 0.5),
        ] {
            let curve = MotionCurve::compile(vec![0.0], 0, vec![(1000, vec![1.0], easing)]);
            assert!((curve.at(500.0)[0] - expected).abs() < 1e-12);
        }
    }

    #[test]
    fn restricted_easing_retains_the_original_values_between_new_endpoints() {
        for easing in [Easing::EaseIn, Easing::EaseOut, Easing::Smooth] {
            let original = MotionCurve::compile(vec![0.3], 0, vec![(6000, vec![0.9], easing)]);
            let remapped =
                MotionCurve::compile(original.at(1500.0), 0, original.fragment(1500, 4500, 0));
            for time in [0.0, 125.0, 900.0, 1725.0, 2999.0, 3000.0] {
                assert!((original.at(1500.0 + time)[0] - remapped.at(time)[0]).abs() < 1e-10);
            }
        }
    }
}
