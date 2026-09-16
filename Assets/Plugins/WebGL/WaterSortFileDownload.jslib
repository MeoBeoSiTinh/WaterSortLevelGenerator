mergeInto(LibraryManager.library, {
  WaterSort_DownloadTextFile: function (filenamePtr, contentPtr, mimePtr) {
    var filename = UTF8ToString(filenamePtr);
    var content = UTF8ToString(contentPtr);
    var mime = UTF8ToString(mimePtr) || "application/json";
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }
});
