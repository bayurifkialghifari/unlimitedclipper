use crate::models::{EditDocument, Word};

pub fn caption_groups(document: &EditDocument) -> Vec<&[Word]> {
    let mut groups = Vec::new();
    let mut start = 0;
    let maximum = document.captions.words_per_line.max(1);
    for index in 0..document.words.len() {
        let word = &document.words[index];
        let next = document.words.get(index + 1);
        let ends_sentence = word.text.ends_with(['.', '!', '?', ';', ':']);
        let gap = next.is_some_and(|next| next.start_ms - word.end_ms > 450);
        let long = word.end_ms - document.words[start].start_ms >= 2200;
        if index - start + 1 >= maximum || ends_sentence || gap || long || next.is_none() {
            groups.push(&document.words[start..=index]);
            start = index + 1;
        }
    }
    groups
}

fn clock(milliseconds: i64, ass: bool) -> String {
    let time = milliseconds.max(0);
    let hours = time / 3_600_000;
    let minutes = time / 60_000 % 60;
    let seconds = time / 1000 % 60;
    if ass {
        format!("{hours}:{minutes:02}:{seconds:02}.{:02}", time / 10 % 100)
    } else {
        format!("{hours:02}:{minutes:02}:{seconds:02},{:03}", time % 1000)
    }
}

pub fn escape_ass(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('{', "\\{")
        .replace('}', "\\}")
        .replace('\r', "")
        .replace('\n', "\\N")
}

fn color(value: &str) -> String {
    format!("&H00{}{}{}", &value[5..7], &value[3..5], &value[1..3])
}

fn override_color(value: &str) -> String {
    format!("&H{}{}{}&", &value[5..7], &value[3..5], &value[1..3])
}

pub fn srt(document: &EditDocument) -> String {
    caption_groups(document)
        .into_iter()
        .enumerate()
        .map(|(index, words)| {
            let text = words
                .iter()
                .map(|word| word.text.as_str())
                .collect::<Vec<_>>()
                .join(" ");
            format!(
                "{}\n{} --> {}\n{}\n\n",
                index + 1,
                clock(words[0].start_ms, false),
                clock(
                    words.last().expect("Caption group is not empty").end_ms,
                    false
                ),
                text
            )
        })
        .collect()
}

fn dialogue(layer: u32, start: i64, end: i64, style: &str, text: &str) -> String {
    format!(
        "Dialogue: {layer},{},{},{style},,0,0,0,,{text}\n",
        clock(start, true),
        clock(end, true)
    )
}

fn styled_word(word: &Word, active: bool, document: &EditDocument) -> String {
    let chosen_color = word.color.as_deref().unwrap_or(if active {
        &document.captions.highlight_color
    } else {
        &document.captions.color
    });
    let bold = if word.emphasis || document.captions.bold {
        700
    } else {
        400
    };
    let text = if document.captions.uppercase {
        word.text.to_uppercase()
    } else {
        word.text.clone()
    };
    let box_tags = if document.captions.preset == "box" {
        if active {
            let (width, height) = document.layout.dimensions(document.resolution);
            let padding = 8.0 * width.min(height) as f64 / 1080.0;
            format!(
                "\\3a&H00&\\3c{}\\bord{padding}\\1c{}",
                override_color(&document.captions.highlight_color),
                override_color(word.color.as_deref().unwrap_or(&document.captions.color))
            )
        } else {
            "\\3a&HFF&\\bord0".into()
        }
    } else {
        String::new()
    };
    format!(
        "{{\\1c{}\\b{bold}{box_tags}}}{}",
        override_color(chosen_color),
        escape_ass(&text)
    )
}

pub fn ass(document: &EditDocument) -> String {
    let (width, height) = document.layout.dimensions(document.resolution);
    let caption = &document.captions;
    let title = &document.title;
    let size_scale = width.min(height) as f64 / 1080.0;
    let caption_size = (caption.size as f64 * size_scale).round() as u32;
    let title_size = (title.size as f64 * size_scale).round() as u32;
    let outline = caption.outline * size_scale;
    let border_style = if caption.preset == "box" { 3 } else { 1 };
    let caption_bold = if caption.bold { 1 } else { 0 };
    let caption_shadow = if caption.preset == "box" { 0.0 } else { 1.5 };
    let margin = (width as f64 * 0.09).round() as u32;
    let watermark_x = (document.watermark.x * width as f64)
        .round()
        .clamp(8.0, width as f64 - 8.0);
    let watermark_y = (document.watermark.y * height as f64)
        .round()
        .clamp(8.0, height as f64 - 8.0);
    let right = document.watermark.x > 0.5;
    let bottom = document.watermark.y > 0.5;
    let watermark_alignment = match (right, bottom) {
        (false, false) => 7,
        (true, false) => 9,
        (false, true) => 1,
        (true, true) => 3,
    };
    let horizontal_space = if right {
        watermark_x - 8.0
    } else {
        width as f64 - watermark_x - 8.0
    };
    let vertical_space = if bottom {
        watermark_y - 8.0
    } else {
        height as f64 - watermark_y - 8.0
    };
    let longest_line = document
        .watermark
        .text
        .lines()
        .map(|line| line.chars().count())
        .max()
        .unwrap_or(1)
        .max(1);
    let line_count = document.watermark.text.lines().count().max(1);
    let watermark_size = (width as f64 * document.watermark.scale * 0.22)
        .min(horizontal_space / (longest_line as f64 * 1.25))
        .min(vertical_space / (line_count as f64 * 1.5))
        .max(1.0)
        .round() as u32;
    let mut result = format!(
        "[Script Info]\nScriptType: v4.00+\nPlayResX: {width}\nPlayResY: {height}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Caption,{},{} ,{},{},{},&H80000000,{caption_bold},0,0,0,100,100,0,0,{border_style},{outline},{caption_shadow},5,{margin},{margin},20,1\nStyle: Title,{},{} ,{},&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,{},3,0,5,{margin},{margin},30,1\nStyle: Watermark,Noto Sans,{},{} ,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,1,0,7,0,0,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n",
        caption.font,
        caption_size,
        color(&caption.color),
        color(&caption.highlight_color),
        color(&caption.outline_color),
        title.font,
        title_size,
        color(&title.color),
        if title.preset == "boxed" { 3 } else { 1 },
        watermark_size,
        color(&document.watermark.color),
    );
    let caption_position = format!(
        "\\an5\\pos({},{})",
        width / 2,
        (height as f64 * caption.position_y).round()
    );
    if caption.enabled {
        for words in caption_groups(document) {
            if caption.preset == "plain" {
                let content = words
                    .iter()
                    .map(|word| styled_word(word, false, document))
                    .collect::<Vec<_>>()
                    .join(" ");
                result.push_str(&dialogue(
                    1,
                    words[0].start_ms,
                    words.last().expect("Non-empty group").end_ms,
                    "Caption",
                    &format!("{{{caption_position}}}{content}"),
                ));
            } else {
                for (index, word) in words.iter().enumerate() {
                    let content = if caption.preset == "word" {
                        styled_word(word, true, document)
                    } else {
                        words
                            .iter()
                            .enumerate()
                            .map(|(position, item)| styled_word(item, position == index, document))
                            .collect::<Vec<_>>()
                            .join(" ")
                    };
                    let animate = caption.preset == "word" || index == 0;
                    let animation = match (caption.animation.as_str(), animate) {
                        ("fade", true) => "\\fad(70,50)",
                        ("pop", true) => "\\fscx94\\fscy94\\t(0,80,\\fscx100\\fscy100)",
                        _ => "",
                    };
                    let end = words
                        .get(index + 1)
                        .map(|next| next.start_ms.min(word.end_ms + 120))
                        .unwrap_or(word.end_ms)
                        .max(word.start_ms + 1);
                    result.push_str(&dialogue(
                        1,
                        word.start_ms,
                        end,
                        "Caption",
                        &format!("{{{caption_position}{animation}}}{content}"),
                    ));
                }
            }
        }
    }
    let duration = document.end_ms - document.start_ms;
    if !title.text.is_empty() && title.duration_ms > 0 {
        let title_tags = format!(
            "\\an5\\pos({},{})\\b{}",
            width / 2,
            (height as f64 * title.position_y).round(),
            if title.preset == "plain" { 0 } else { 1 }
        );
        result.push_str(&dialogue(
            2,
            0,
            title.duration_ms.min(duration),
            "Title",
            &format!("{{{title_tags}}}{}", escape_ass(&title.text)),
        ));
    }
    if document.watermark.mode == "text" && !document.watermark.text.is_empty() {
        let opacity = ((1.0 - document.watermark.opacity) * 255.0).round() as u32;
        let tags = format!(
            "\\an{watermark_alignment}\\pos({},{})\\alpha&H{opacity:02X}&",
            watermark_x, watermark_y
        );
        result.push_str(&dialogue(
            3,
            0,
            duration,
            "Watermark",
            &format!("{{{tags}}}{}", escape_ass(&document.watermark.text)),
        ));
    }
    result
}
pub fn vtt(document: &EditDocument) -> String {
    let timestamp = |milliseconds: i64| {
        format!(
            "{:02}:{:02}:{:02}.{:03}",
            milliseconds / 3_600_000,
            milliseconds / 60_000 % 60,
            milliseconds / 1000 % 60,
            milliseconds % 1000
        )
    };
    let mut content = String::from("WEBVTT\n\n");
    for words in caption_groups(document) {
        let start = document.start_ms + words[0].start_ms;
        let end = document.start_ms + words.last().expect("Nonempty word group").end_ms;
        let text = words
            .iter()
            .map(|word| {
                word.text
                    .replace('&', "&amp;")
                    .replace('<', "&lt;")
                    .replace(['\r', '\n'], " ")
            })
            .collect::<Vec<_>>()
            .join(" ");
        content.push_str(&format!(
            "{} --> {}\n{}\n\n",
            timestamp(start),
            timestamp(end),
            text
        ));
    }
    content
}
