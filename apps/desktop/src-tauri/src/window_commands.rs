use tauri::{Emitter, Runtime, WebviewWindow};

pub fn send<R: Runtime>(window: &WebviewWindow<R>, command: &str) -> tauri::Result<()> {
    // Emitter::emit broadcasts even when called on a window handle.
    window.emit_to(window.label(), "document-command", command)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tauri::{
        Listener, WebviewWindowBuilder,
        test::{mock_builder, mock_context, noop_assets},
    };

    #[test]
    fn commands_reach_only_the_selected_document() {
        let app = mock_builder().build(mock_context(noop_assets())).unwrap();
        let first = WebviewWindowBuilder::new(&app, "first", Default::default())
            .build()
            .unwrap();
        let second = WebviewWindowBuilder::new(&app, "second", Default::default())
            .build()
            .unwrap();
        let first_events = Arc::new(Mutex::new(Vec::new()));
        let second_events = Arc::new(Mutex::new(Vec::new()));
        for (window, events) in [(&first, &first_events), (&second, &second_events)] {
            let events = Arc::clone(events);
            window.listen("document-command", move |event| {
                events.lock().unwrap().push(event.payload().to_owned());
            });
        }

        for command in [
            "document.close",
            "document.save",
            "document.saveAs",
            "document.exportDocx",
            "document.exportPdf",
            "document.open",
            "edit.undo",
            "edit.redo",
            "app.settings",
        ] {
            send(&second, command).unwrap();
            assert!(
                first_events.lock().unwrap().is_empty(),
                "background window received {command}"
            );
            assert_eq!(
                *second_events.lock().unwrap(),
                vec![serde_json::to_string(command).unwrap()]
            );
            second_events.lock().unwrap().clear();
        }

        // Quit explicitly visits every window; each must receive only one close.
        for window in [&first, &second] {
            send(window, "document.close").unwrap();
        }
        for events in [&first_events, &second_events] {
            assert_eq!(*events.lock().unwrap(), vec!["\"document.close\""]);
        }
    }
}
