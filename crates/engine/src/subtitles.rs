use crate::models::{EditDocument, Word};

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
    document
        .words
        .chunks(document.captions.words_per_line.max(1))
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
    let bold = if word.emphasis || active { 1 } else { 0 };
    format!(
        "{{\\1c{}\\b{bold}}}{}",
        override_color(chosen_color),
        escape_ass(&word.text)
    )
}

pub fn ass(document: &EditDocument) -> String {
    let (width, height) = document.layout.dimensions(document.resolution);
    let caption = &document.captions;
    let title = &document.title;
    let size_scale = width as f64 / 1080.0;
    let caption_size = (caption.size as f64 * size_scale).round() as u32;
    let title_size = (title.size as f64 * size_scale).round() as u32;
    let outline = caption.outline * size_scale;
    let border_style = if caption.preset == "box" { 3 } else { 1 };
    let mut result = format!(
        "[Script Info]\nScriptType: v4.00+\nPlayResX: {width}\nPlayResY: {height}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Caption,{},{} ,{},{},{},&H80000000,0,0,0,0,100,100,0,0,{border_style},{outline},0,5,20,20,20,1\nStyle: Title,{},{} ,{},&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,{},3,0,5,30,30,30,1\nStyle: Watermark,Noto Sans,{},{} ,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,1,0,7,0,0,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n",
        caption.font,
        caption_size,
        color(&caption.color),
        color(&caption.highlight_color),
        color(&caption.outline_color),
        title.font,
        title_size,
        color(&title.color),
        if title.preset == "boxed" { 3 } else { 1 },
        (width as f64 * document.watermark.scale * 0.22).round() as u32,
        color(&document.watermark.color),
    );
    let caption_position = format!(
        "\\an5\\pos({},{})",
        width / 2,
        (height as f64 * caption.position_y).round()
    );
    if caption.enabled {
        for words in document.words.chunks(caption.words_per_line.max(1)) {
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
                    let content = if caption.preset == "word" || caption.preset == "box" {
                        styled_word(word, true, document)
                    } else {
                        words
                            .iter()
                            .enumerate()
                            .map(|(position, item)| styled_word(item, position == index, document))
                            .collect::<Vec<_>>()
                            .join(" ")
                    };
                    let animation = match caption.animation.as_str() {
                        "fade" => "\\fad(70,50)",
                        "pop" => "\\fscx90\\fscy90\\t(0,80,\\fscx100\\fscy100)",
                        _ => "",
                    };
                    let end = words
                        .get(index + 1)
                        .map(|next| next.start_ms)
                        .unwrap_or(word.end_ms)
                        .max(word.end_ms);
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
            "\\an7\\pos({},{})\\alpha&H{opacity:02X}&",
            (document.watermark.x * width as f64).round(),
            (document.watermark.y * height as f64).round()
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
    for words in document.words.chunks(document.captions.words_per_line) {
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
