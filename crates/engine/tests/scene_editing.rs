use unlimitedclipper_engine::models::*;
use unlimitedclipper_engine::subtitles;

fn project() -> Project {
    Project {
        id: "scene-fixture".into(),
        name: "Scene editing fixture".into(),
        source_kind: "file".into(),
        source_url: None,
        asset_id: "fixture-video".into(),
        preview_asset_id: None,
        thumbnail_id: None,
        duration_ms: 8000,
        width: 1280,
        height: 720,
        has_audio: true,
        language: Some("en".into()),
        transcript_configuration: None,
        created_at: 0,
        words: [
            ("first", 1200, 1500),
            ("second", 3400, 3800),
            ("third", 5600, 5900),
        ]
        .into_iter()
        .map(|(text, start_ms, end_ms)| Word {
            id: text.into(),
            text: text.into(),
            start_ms,
            end_ms,
            emphasis: false,
            color: None,
            confidence: None,
            timing: None,
        })
        .collect(),
    }
}

fn scene(id: &str, start_ms: i64, end_ms: i64) -> SourceSegment {
    SourceSegment {
        id: Some(id.into()),
        start_ms,
        end_ms,
    }
}

fn document() -> EditDocument {
    EditDocument::new(&project(), 0, 6000).replace_segments(vec![
        scene("a", 0, 2000),
        scene("b", 3000, 4000),
        scene("c", 5000, 6000),
    ])
}

fn card(text: &str, duration_ms: i64) -> HeadingCard {
    HeadingCard {
        text: text.into(),
        duration_ms,
        font: "Oswald".into(),
        size: 90,
        color: "#FFFFFF".into(),
        background: "#151B24".into(),
        position_y: 0.5,
        animation: "none".into(),
        narration: None,
    }
}

#[test]
fn independent_cards_keep_source_provenance_and_content_tracks_after_reorder() {
    let mut original = document();
    original.version = 4;
    original.intro_card = Some(card("Opening", 1000));
    original.outro_card = Some(card("Closing", 1500));
    original.validate(project().duration_ms).unwrap();
    assert_eq!(original.content_duration_ms(), 4000);
    assert_eq!(original.final_duration_ms(), 6500);
    for time in [-1, 0, 999, 5000, 6499, 6500] {
        assert_eq!(original.output_to_source(time), None);
    }
    assert_eq!(original.output_to_source(1000), Some(0));
    assert_eq!(original.output_to_source(3000), Some(3000));
    assert_eq!(original.source_to_output(3000), Some(3000));
    assert_eq!(original.source_to_output(6000), None);
    let reordered = original.replace_segments(vec![scene("c", 5000, 6000), scene("a", 0, 2000)]);
    reordered.validate(project().duration_ms).unwrap();
    assert_eq!(reordered.version, 4);
    assert_eq!(reordered.final_duration_ms(), 5500);
    assert_eq!(reordered.output_to_source(1000), Some(5000));
    let third = reordered
        .words
        .iter()
        .find(|word| word.id == "third")
        .unwrap();
    assert_eq!(third.start_ms, 600);
    assert_eq!(third.timing.as_ref().unwrap().source_start_ms, 5600);
    assert_eq!(reordered.intro_card.unwrap().duration_ms, 1000);
    assert_eq!(reordered.outro_card.unwrap().duration_ms, 1500);
}

#[test]
fn cards_offset_captions_once_and_source_vtt_stays_on_source_time() {
    let mut original = document();
    original.version = 4;
    original.intro_card = Some(card("Opening", 1000));
    original.outro_card = Some(card("Closing", 1500));
    original.captions.preset = "plain".into();
    let ass = unlimitedclipper_engine::subtitles::ass(&original);
    assert!(ass.contains("Dialogue: 1,0:00:02.20,0:00:02.50,Caption"));
    assert!(ass.contains("Dialogue: 6,0:00:00.00,0:00:01.00,Title"));
    assert!(ass.contains("Dialogue: 6,0:00:05.00,0:00:06.50,Title"));
    let srt = unlimitedclipper_engine::subtitles::srt(&original);
    assert!(srt.contains("00:00:02,200 --> 00:00:02,500"));
    let source = unlimitedclipper_engine::subtitles::vtt_timeline(&original, false);
    let output = unlimitedclipper_engine::subtitles::vtt_timeline(&original, true);
    assert!(source.contains("00:00:05.600 --> 00:00:05.900"));
    assert!(output.contains("00:00:04.600 --> 00:00:04.900"));
}

#[test]
fn legacy_documents_are_not_promoted_and_invalid_cards_are_rejected() {
    for version in [1, 2, 3] {
        let mut original = document();
        if version < 3 {
            original = EditDocument::new(&project(), 0, 6000);
            if version == 1 {
                original.segments.clear();
            }
        }
        original.version = version;
        let encoded = serde_json::to_value(&original).unwrap();
        assert!(encoded.get("intro_card").is_none());
        let loaded: EditDocument = serde_json::from_value(encoded).unwrap();
        assert_eq!(loaded.version, version);
        loaded.validate(project().duration_ms).unwrap();
        original.intro_card = Some(card("Opening", 1000));
        assert!(original.validate(project().duration_ms).is_err());
    }
    let mut original = document();
    original.version = 4;
    for invalid in [
        card("", 1000),
        card("Opening", -100),
        card("Opening", 10_001),
    ] {
        original.intro_card = Some(invalid);
        assert!(original.validate(project().duration_ms).is_err());
    }
    original.intro_card = Some(card("Opening", 1000));
    original.segments[1].id = original.segments[0].id.clone();
    assert!(original.validate(project().duration_ms).is_err());
}

#[test]
fn eased_motion_keeps_its_curve_and_source_clock_after_reorder_and_trim() {
    use unlimitedclipper_engine::motion::{
        CameraKeyframe, Easing, LayerKeyframe, camera_curve, layer_curve,
    };
    let mut original =
        EditDocument::new(&project(), 0, 6000).replace_segments(vec![scene("all", 0, 6000)]);
    original.version = 4;
    original.intro_card = Some(card("Opening", 1000));
    original.camera_motion = vec![
        CameraKeyframe {
            time_ms: 0,
            x: 0.2,
            y: 0.5,
            zoom: 1.0,
            easing: Easing::Linear,
        },
        CameraKeyframe {
            time_ms: 6000,
            x: 0.8,
            y: 0.7,
            zoom: 2.0,
            easing: Easing::Smooth,
        },
    ];
    let mut visual = note(0, 6000);
    visual.motion = vec![
        LayerKeyframe {
            time_ms: 0,
            x: 0.2,
            y: 0.3,
            scale: 0.5,
            opacity: 0.2,
            easing: Easing::Linear,
        },
        LayerKeyframe {
            time_ms: 6000,
            x: 0.7,
            y: 0.8,
            scale: 1.5,
            opacity: 1.0,
            easing: Easing::EaseIn,
        },
    ];
    original.visual_layers.push(visual);
    original.validate(project().duration_ms).unwrap();
    let graphics = subtitles::ass(&original);
    assert!(graphics.contains("\\move("));
    assert!(graphics.contains("\\alpha&H"));
    let target = original.replace_segments(vec![
        scene("later", 4000, 6000),
        scene("earlier", 1000, 2000),
    ]);
    target.validate(project().duration_ms).unwrap();
    for (time, source_time) in [
        (200, 4200),
        (1100, 5100),
        (1990, 5990),
        (2100, 1100),
        (2500, 1500),
        (2990, 1990),
    ] {
        let original_camera = camera_curve(&original).at(source_time as f64);
        let camera = camera_curve(&target).at(time as f64);
        for (expected, actual) in original_camera.iter().zip(camera) {
            assert!(
                (expected - actual).abs() < 1e-8,
                "Restricted camera easing must retain its trajectory."
            );
        }
        let layer = target
            .visual_layers
            .iter()
            .find(|layer| layer.start_ms <= time && time < layer.end_ms)
            .unwrap();
        let expected = layer_curve(&original.visual_layers[0]).at(source_time as f64);
        let actual = layer_curve(layer).at(time as f64);
        for (expected, actual) in expected.iter().zip(actual) {
            assert!(
                (expected - actual).abs() < 1e-8,
                "Layer easing must retain its trajectory."
            );
        }
    }
    assert_eq!(target.intro_card.unwrap().duration_ms, 1000);
}

#[test]
fn broll_motion_accepts_zoom_and_opacity_but_rejects_unsupported_transforms() {
    use unlimitedclipper_engine::motion::{Easing, LayerKeyframe};

    let mut document =
        EditDocument::new(&project(), 0, 6000).replace_segments(vec![scene("all", 0, 6000)]);
    document.version = 4;
    let mut layer = note(0, 6000);
    layer.kind = "broll".into();
    layer.asset_id = Some("managed-video".into());
    layer.motion = vec![
        LayerKeyframe {
            time_ms: 0,
            x: 0.5,
            y: 0.5,
            scale: 1.0,
            opacity: 1.0,
            easing: Easing::Linear,
        },
        LayerKeyframe {
            time_ms: 6000,
            x: 0.7,
            y: 0.4,
            scale: 2.0,
            opacity: 0.5,
            easing: Easing::Smooth,
        },
    ];
    document.visual_layers.push(layer);
    document.validate(project().duration_ms).unwrap();
    document.visual_layers[0].motion[1].scale = 0.8;
    let error = document.validate(project().duration_ms).unwrap_err();
    assert!(error.contains("valid transforms"));
    document.visual_layers[0].motion[1].scale = 2.0;
    document.visual_layers[0].kind = "split".into();
    let error = document.validate(project().duration_ms).unwrap_err();
    assert!(error.contains("Motion is available on text, note, and B-roll layers"));
}

#[test]
fn broll_motion_and_media_offsets_follow_reordered_scenes() {
    use unlimitedclipper_engine::motion::{Easing, LayerKeyframe, layer_curve};

    let mut original =
        EditDocument::new(&project(), 0, 6000).replace_segments(vec![scene("all", 0, 6000)]);
    original.version = 4;
    let mut layer = note(0, 6000);
    layer.kind = "broll".into();
    layer.asset_id = Some("managed-video".into());
    layer.source_start_ms = 500;
    layer.motion = vec![
        LayerKeyframe {
            time_ms: 0,
            x: 0.4,
            y: 0.5,
            scale: 1.0,
            opacity: 0.2,
            easing: Easing::Linear,
        },
        LayerKeyframe {
            time_ms: 6000,
            x: 0.7,
            y: 0.5,
            scale: 2.0,
            opacity: 1.0,
            easing: Easing::Smooth,
        },
    ];
    original.visual_layers.push(layer);
    let reordered = original.replace_segments(vec![
        scene("later", 4000, 6000),
        scene("earlier", 1000, 2000),
    ]);
    reordered.validate(project().duration_ms).unwrap();
    for (time, source_time, media_start) in [
        (200, 4200, 4500),
        (1500, 5500, 4500),
        (2100, 1100, 1500),
        (2800, 1800, 1500),
    ] {
        let fragment = reordered
            .visual_layers
            .iter()
            .find(|layer| layer.start_ms <= time && time < layer.end_ms)
            .unwrap();
        assert_eq!(fragment.source_start_ms, media_start);
        let expected = layer_curve(&original.visual_layers[0]).at(source_time as f64);
        let actual = layer_curve(fragment).at(time as f64);
        for (expected, actual) in expected.iter().zip(actual) {
            assert!((expected - actual).abs() < 1e-8);
        }
    }
}

#[test]
fn legacy_styles_default_and_timed_hooks_keep_output_relative_bounds() {
    let original = document();
    let mut legacy = serde_json::to_value(&original).unwrap();
    legacy.as_object_mut().unwrap().remove("video_adjustments");
    legacy["title"].as_object_mut().unwrap().remove("start_ms");
    legacy["title"].as_object_mut().unwrap().remove("animation");
    let mut loaded: EditDocument = serde_json::from_value(legacy).unwrap();
    assert_eq!(loaded.video_adjustments, VideoAdjustments::default());
    assert_eq!(loaded.title.start_ms, 0);
    assert_eq!(loaded.title.animation, "none");
    loaded.title.text = "Keep the context".into();
    loaded.title.start_ms = 500;
    loaded.title.duration_ms = 1200;
    loaded.title.animation = "fade".into();
    loaded.validate(project().duration_ms).unwrap();
    let ass = unlimitedclipper_engine::subtitles::ass(&loaded);
    assert!(ass.contains("Dialogue: 2,0:00:00.50,0:00:01.70,Title"));
    assert!(ass.contains("\\fad(140,140)"));
    loaded.video_adjustments.brightness = 101;
    assert!(loaded.validate(project().duration_ms).is_err());
    loaded.video_adjustments.brightness = 0;
    loaded.title.animation = "unknown".into();
    assert!(loaded.validate(project().duration_ms).is_err());
}

fn note(start_ms: i64, end_ms: i64) -> VisualLayer {
    VisualLayer {
        id: "note".into(),
        motion: Vec::new(),
        enabled: true,
        start_ms,
        end_ms,
        kind: "note".into(),
        text: "Scene note".into(),
        crop: None,
        secondary_crop: None,
        x: 0.5,
        y: 0.2,
        color: "#FFFFFF".into(),
        size: 60,
        asset_id: None,
        source_start_ms: 0,
    }
}

#[test]
fn reordered_scenes_keep_source_anchors_and_layer_audio_offsets() {
    let mut original = document();
    let second = original
        .words
        .iter_mut()
        .find(|word| word.id == "second")
        .unwrap();
    second.text = "Manual correction".into();
    second.timing = Some(WordTiming {
        provenance: "manual".into(),
        source_start_ms: 3400,
        source_end_ms: 3800,
        alignment_confidence: None,
    });
    original.visual_layers.push(note(3200, 3500));
    original.audio_layers.push(AudioLayer {
        id: "audio".into(),
        enabled: true,
        start_ms: 2300,
        end_ms: 2600,
        asset_id: Some("registered-audio".into()),
        source_start_ms: 100,
        gain: 0.5,
    });
    let reordered = original.replace_segments(vec![
        scene("c", 5000, 6000),
        scene("a", 0, 2000),
        scene("b", 3000, 4000),
    ]);
    reordered.validate(8000).unwrap();
    assert_eq!(reordered.version, 3);
    assert_eq!(reordered.duration_ms(), 4000);
    assert_eq!((reordered.start_ms, reordered.end_ms), (0, 6000));
    assert_eq!(reordered.output_to_source(0), Some(5000));
    assert_eq!(reordered.output_to_source(1000), Some(0));
    assert_eq!(reordered.output_to_source(4000), Some(4000));
    assert_eq!(
        reordered
            .words
            .iter()
            .map(|word| word.id.as_str())
            .collect::<Vec<_>>(),
        ["third", "first", "second"]
    );
    assert_eq!(reordered.words[2].text, "Manual correction");
    let source_vtt = unlimitedclipper_engine::subtitles::vtt(&reordered);
    let output_vtt = unlimitedclipper_engine::subtitles::vtt_timeline(&reordered, true);
    assert!(source_vtt.find("first").unwrap() < source_vtt.find("third").unwrap());
    assert!(output_vtt.find("third").unwrap() < output_vtt.find("first").unwrap());
    assert_eq!(
        reordered.words[2].timing.as_ref().unwrap().source_start_ms,
        3400
    );
    assert_eq!(reordered.words[2].start_ms, 3400);
    assert_eq!(
        (
            reordered.visual_layers[0].start_ms,
            reordered.visual_layers[0].end_ms
        ),
        (200, 500)
    );
    assert_eq!(reordered.audio_layers[0].start_ms, 3300);
    assert_eq!(reordered.audio_layers[0].source_start_ms, 100);
}

#[test]
fn extension_adds_source_words_without_restoring_deleted_caption_text() {
    let mut original = EditDocument::new(&project(), 1000, 2000);
    original.words.clear();
    let mut extended = original.replace_segments(vec![scene("extended", 1000, 4000)]);
    extended.hydrate_added_words(&original, &project().words);
    extended.validate(8000).unwrap();
    assert_eq!(extended.words.len(), 1);
    assert_eq!(extended.words[0].id, "second");
    assert_eq!(extended.words[0].start_ms, 2400);
}

#[test]
fn splitting_and_reordering_preserve_asset_content_and_fragment_identity() {
    let mut original = document();
    original.audio_layers.push(AudioLayer {
        id: "bed".into(),
        enabled: true,
        start_ms: 1800,
        end_ms: 2300,
        asset_id: Some("registered-audio".into()),
        source_start_ms: 1000,
        gain: 0.5,
    });
    let reordered = original.replace_segments(vec![
        scene("b", 3000, 4000),
        scene("a", 0, 2000),
        scene("c", 5000, 6000),
    ]);
    reordered.validate(8000).unwrap();
    assert_eq!(reordered.audio_layers.len(), 2);
    let first = reordered
        .audio_layers
        .iter()
        .find(|layer| layer.start_ms == 0)
        .unwrap();
    assert_eq!(first.source_start_ms, 1200);
    let second = reordered
        .audio_layers
        .iter()
        .find(|layer| layer.id == "bed")
        .unwrap();
    assert_eq!(second.start_ms, 2800);
    assert_eq!(second.source_start_ms, 1000);
    let again = original.replace_segments(reordered.segments.clone());
    assert_eq!(first.id, again.audio_layers[0].id);
}

#[test]
fn scene_crop_reaches_its_own_boundary_before_the_next_cut() {
    let mut original = document();
    original.crop.width = 0.3;
    original.keyframes = vec![
        Keyframe {
            time_ms: 0,
            x: 0.1,
            y: 0.0,
        },
        Keyframe {
            time_ms: 3000,
            x: 0.6,
            y: 0.0,
        },
    ];
    let reordered = original.replace_segments(vec![
        scene("c", 5000, 6000),
        scene("a", 0, 2000),
        scene("b", 3000, 4000),
    ]);
    reordered.validate(8000).unwrap();
    assert!(
        reordered
            .keyframes
            .iter()
            .any(|key| key.time_ms == 999 && key.x == 0.6)
    );
    assert!(
        reordered
            .keyframes
            .iter()
            .any(|key| key.time_ms == 1000 && key.x == 0.1)
    );
}

#[test]
fn legacy_documents_remain_readable_and_repeated_or_unidentified_scenes_are_rejected() {
    let original = EditDocument::new(&project(), 0, 6000);
    assert_eq!(original.version, 2);
    assert!(original.segments[0].id.is_none());
    original.validate(8000).unwrap();
    let repeated = original.replace_segments(vec![scene("a", 0, 2000), scene("copy", 0, 2000)]);
    assert!(repeated.validate(8000).is_err());
    let missing =
        original.replace_segments(vec![scene("a", 0, 2000), SourceSegment::new(3000, 4000)]);
    assert!(missing.validate(8000).is_err());
    let duplicate = original.replace_segments(vec![scene("a", 0, 2000), scene("a", 3000, 4000)]);
    assert!(duplicate.validate(8000).is_err());
}

#[test]
fn acoustic_words_crossing_a_removed_gap_keep_the_largest_surviving_fragment() {
    let mut raw = project().words[0].clone();
    raw.start_ms = 1900;
    raw.end_ms = 3200;
    let reordered = document().replace_segments(vec![
        scene("b", 3000, 4000),
        scene("a", 0, 2000),
        scene("c", 5000, 6000),
    ]);
    let mapped = reordered.map_source_word(&raw).unwrap();
    assert_eq!((mapped.start_ms, mapped.end_ms), (0, 200));
    assert_eq!(mapped.id, raw.id);
    assert_eq!(mapped.timing.unwrap().source_start_ms, 1900);
}
