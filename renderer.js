const {ipcRenderer} = require("electron");

function renderIndex(index) {
    if (index > -1) {
        document.querySelector("#container").className = "progress";
    } else {
        document.querySelector("#container").className = "";
    }
    document.querySelector("#queue").innerHTML = index;
}

window.onload = function() {
    ipcRenderer.on("log", function(e, res) {
        console.log(">", ...res);
    });

    ipcRenderer.on("err", function(e, res) {
        console.error(">", ...res);
    });

    ipcRenderer.on("render-index", function(e, res) {
        renderIndex(res);
    });
    // set handlers
    // document.body.addEventListener("keydown", pasteHandler);
}

// function pasteHandler(e) {
//     if (((isWin() && e.ctrlKey) || (isMac() && e.metaKey)) && e.keyCode === 86) {
//         // ctrl + v
//         e.preventDefault();
//         const text = clipboard.readText();
//         if (isYoutubeURL(text)) {
//             downloadHandler(text)
//         } else {
//             console.error("URL not youtube url.", text);
//         }
//     }
// }

