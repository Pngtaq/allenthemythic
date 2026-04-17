{{flutter_js}}
{{flutter_build_config}}

// Bug repro: point CanvasKit at an unroutable IP so canvaskit.js / canvaskit.wasm
// fetches hang until the browser gives up with ERR_TIMED_OUT. Also triggers
// "Failed to fetch dynamically imported module" once the import() rejects.
_flutter.loader.load({
  config: {
    canvasKitBaseUrl: "https://10.255.255.1/flutter-canvaskit/"
  }
});
