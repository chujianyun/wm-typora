use objc2::{
    ClassType, MainThreadMarker, define_class, msg_send,
    rc::Retained,
    runtime::{AnyObject, Bool, ProtocolObject},
};
use objc2_app_kit::{
    NSPrintInfo, NSPrintJobSavingURL, NSPrintOperation, NSPrintSaveJob, NSPrintingPaginationMode,
};
use objc2_foundation::{NSObject, NSObjectProtocol, NSSize, NSString, NSURL};
use objc2_web_kit::WKWebView;
use std::{ffi::c_void, path::Path, sync::mpsc::Sender};

type Completion = Sender<Result<(), String>>;

define_class!(
    // NSObject has no subclassing requirements. The delegate is stateless and
    // AppKit may deliver its completion on the print thread.
    #[unsafe(super = NSObject)]
    #[name = "WTyporaPDFCompletion"]
    struct PrintDelegate;

    unsafe impl NSObjectProtocol for PrintDelegate {}

    impl PrintDelegate {
        #[unsafe(method(printOperationDidRun:success:contextInfo:))]
        fn completed(&self, _operation: &NSPrintOperation, success: Bool, context: *mut c_void) {
            // One Box is transferred to AppKit by start(), returned exactly once
            // by the documented print completion callback.
            let sender = unsafe { Box::from_raw(context.cast::<Completion>()) };
            let _ = sender.send(if success.as_bool() { Ok(()) } else { Err("系统 PDF 排版失败，请重试。".into()) });
        }
    }
);

thread_local! {
    // AppKit does not own the delegate. Keep this stateless instance alive on
    // the main thread for the application's lifetime, including async printing.
    static DELEGATE: Retained<PrintDelegate> = unsafe { msg_send![PrintDelegate::class(), new] };
}

pub fn start(webview: tauri::webview::PlatformWebview, path: &Path, sender: Completion) {
    let result = (|| {
        let _main = MainThreadMarker::new().ok_or("PDF 排版需要主线程")?;
        // Tauri provides a live WKWebView handle on the main thread.
        unsafe {
            let view = &*webview.inner().cast::<WKWebView>();
            if !view.respondsToSelector(objc2::sel!(printOperationWithPrintInfo:)) {
                return Err("PDF 导出需要 macOS 11 或更新版本。".to_owned());
            }
            let window = view.window().ok_or("导出窗口已关闭")?;
            let info = NSPrintInfo::new();
            info.setPaperSize(NSSize::new(595.28, 841.89));
            info.setTopMargin(56.7);
            info.setBottomMargin(56.7);
            info.setLeftMargin(56.7);
            info.setRightMargin(56.7);
            info.setHorizontallyCentered(false);
            info.setVerticallyCentered(false);
            info.setHorizontalPagination(NSPrintingPaginationMode::Fit);
            info.setVerticalPagination(NSPrintingPaginationMode::Automatic);
            info.setJobDisposition(NSPrintSaveJob);
            let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
            info.dictionary().setObject_forKey(
                url.as_ref() as &AnyObject,
                ProtocolObject::from_ref(NSPrintJobSavingURL),
            );
            let operation = view.printOperationWithPrintInfo(&info);
            operation.setShowsPrintPanel(false);
            operation.setShowsProgressPanel(false);
            // WKPrintingView only waits for the real page range when printing
            // on a secondary thread. runOperation() on the main thread sees
            // its provisional NSIntegerMax range and can spool pages forever.
            operation.setCanSpawnSeparateThread(true);
            DELEGATE.with(|delegate| {
                let context = Box::into_raw(Box::new(sender.clone())).cast();
                operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
                    &window,
                    Some(delegate.as_ref() as &AnyObject),
                    Some(objc2::sel!(printOperationDidRun:success:contextInfo:)),
                    context,
                );
            });
            Ok(())
        }
    })();
    if let Err(error) = result {
        let _ = sender.send(Err(error));
    }
}
