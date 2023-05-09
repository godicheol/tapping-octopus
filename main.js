// main.js

// Modules to control application life and create native browser window
const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const id3 = require("node-id3").Promise;
const sharp = require("sharp");
const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const clipboard = require('electron-clipboard-extended');

const NODE_ENV = "production"; // development, production
const DOWNLOAD_PATH = app.getPath("downloads");

let mainWindow;
let webContents;
let isLoaded = false;
let inProgress = false;
let queueIndex = -1;
let queue = [];
let job = null;

const createWindow = () => {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: isDev() ? 512 : 256,
        height: isDev() ? 512 : 256 + getTitleBarHeight(),
        resizable: isDev() ? true : false,
        icon: path.join(__dirname, "assets/icons/android-chrome-512x512.png"),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: false, // protect against prototype pollution
            nodeIntegration: true, // is default value after Electron v5
            // sandbox: false,
        }
    });

    webContents = mainWindow.webContents;

    // and load the index.html of the app.
    mainWindow.loadFile('index.html')
    // mainWindow.loadURL('http://www.google.com')

    // Open the DevTools.
    if (isDev()) {
        webContents.openDevTools()
    }

    webContents.on("did-finish-load", () => {
        sendLog("Electron Window loaded.");
        isLoaded = true;

        // set ffmpeg path
        try {
            setFfmpegPath();
        } catch(err) {
            sendErr(err);
            dialog.showErrorBox(err.message, "");
            app.quit();
        }
    });

    webContents.on("close", () => {
        sendLog("Electron Window closed.");
        isLoaded = false;
    })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    chkOs();
    createWindow();

    // handle copy action
    clipboard.on("text-changed", copyHandler).startWatching();

    app.on('activate', () => {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    });
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

const sendLog = (...args) => {
    if (isDev()) {
        console.log(">", ...args);
        if (isLoaded) {
            mainWindow.webContents.send('log', [...args]);
        }
    }
}
const sendErr = (...args) => {
    if (isDev()) {
        console.error(">", ...args);
        if (isLoaded) {
            mainWindow.webContents.send('err', [...args]);
        }
    }
}
function isDev() {
    return NODE_ENV === "development";
}
function chkOs() {
    const _os = os.platform();
    if (_os !== "win32" && _os !== "darwin") {
        dialog.showErrorBox("Operating system not supported.", "");
        app.quit();
    }
}
function getTitleBarHeight() {
    const _os = os.platform();
    if (_os === "win32") {
        return 20;
    } else if (_os === "darwin") {
        return 0;
    } else {
        throw new Error("Operating system not supported.");
    }
}
function isYoutubeURL(url) {
    return /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|\?v=)([^#\&\?]*).*/.test(url);
}
function addIndex() {
    queueIndex++;
    renderIndex();
}
function subIndex() {
    queueIndex--;
    renderIndex();
}
function renderIndex() {
    if (isLoaded) {
        mainWindow.webContents.send('render-index', queueIndex);
    }
}
function getFfmpegPath() {
    const _os = os.platform();
    if (_os === "win32") {
        return {
            ffmpeg: path.join(__dirname, "libs", "ffmpeg", _os, "ffmpeg.exe"),
            ffprobe: path.join(__dirname, "libs", "ffmpeg", _os, "ffprobe.exe"),
            flvtool: path.join(__dirname, "libs", "ffmpeg", _os, "flvtool2.exe"),
        }
    } else if (_os === "darwin") {
        // osx
        return {
            ffmpeg: path.join(__dirname, "libs", "ffmpeg", _os, "ffmpeg"),
            ffprobe: path.join(__dirname, "libs", "ffmpeg", _os, "ffprobe"),
            flvtool: path.join(__dirname, "libs", "ffmpeg", _os, "flvtool2.exe"),
        }
    } else {
        throw new Error("Operating system not supported.");
    }
}
function setFfmpegPath() {
    const _ = getFfmpegPath();
    if (!fs.existsSync(_.ffmpeg)) {
        throw new Error("ffmpeg not found.");
    }
    if (!fs.existsSync(_.ffprobe)) {
        throw new Error("ffprobe not found.");
    }
    if (!fs.existsSync(_.flvtool)) {
        throw new Error("flvtool not found.");
    }
    ffmpeg.setFfmpegPath(_.ffmpeg);
    ffmpeg.setFfprobePath(_.ffprobe);
    ffmpeg.setFlvtoolPath(_.flvtool);
}
function toSafeFileName(str) {
    const re1 =/[\\/:\*\?"<>\|]+/g; // forbidden characters \ / : * ? " < > |
    const re2 =/^\./; // cannot start with dot (.)
    const re3 =/^(nul|prn|con|lpt[0-9]|com[0-9])(\.|$)/i; // forbidden file names
    return str.replace(re1, "_").replace(re2, "_").replace(re3, "_");
}
function getDestination(title) {
    const fileName = toSafeFileName(title);
    const extension = ".mp3";
    let suffix = 1;
    let destination = path.join(DOWNLOAD_PATH, fileName+extension);
    let isExists = fs.existsSync(destination);
    while(isExists) {
        suffix++;
        destination = path.join(DOWNLOAD_PATH, fileName+" ("+suffix+")"+extension);
        isExists = fs.existsSync(destination);
    }
    return destination;
}

async function setTags(src, tags, thumbnail) {
    try{
        if (!thumbnail) {
            throw new Error("Thumbnail not found");
        }
        const blob = await downloadThumbnail(thumbnail.url);
        const buffer = Buffer.from(await blob.arrayBuffer());
        const jpeg = await sharp(buffer)
            .resize({
                width: 500,
                height: 500,
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .png()
            .toBuffer();

        sendLog("Thumbnail download completed.", thumbnail);

        await id3.write(Object.assign(tags, {
            image: {
                mime: "image/jpeg",
                type: {
                    id: 3,
                    name: "front cover",
                },
                description: "thumbnail",
                imageBuffer: jpeg,
            }
        }), src);
    } catch(err) {
        sendErr("Thumbnail set failed.");
        try {
            await id3.write(tags, src);
        } catch(err) {
            throw err;
        }
    }
}
function downloadThumbnail(url) {
    return new Promise(function(resolve, reject) {
        fetch(url)
            .then(res => res.blob())
            .then(function(blob) {
                resolve(blob);
            })
            .catch(function(err) {
                reject(err);
            })
    })
}
async function createJob(url) {
    try {
        const newJob = { url: url }

        queue.push(newJob);

        sendLog("Job created:", queue.length);

        addIndex();

        exec();
    } catch(err) {
        console.error(err);
    }
}
async function exec() {
    if (inProgress) {
        sendErr("Already in progress.");
        return;
    }
    if (queue.length < 1) {
        sendErr("Job not found.");
        return;
    }

    inProgress = true;

    job = queue.shift();

    sendLog("Execute job", job);

    const {url} = job;
    const quality = "highestaudio";
    const info = await ytdl.getInfo(url, {quality: quality});
    const {title, author, category, thumbnails, video_url, publishDate} = info.videoDetails;

    const format = ytdl.chooseFormat(info.formats, {quality: quality});

    sendLog("Format selected", format);

    const thumbnail = thumbnails && thumbnails.sort(function(a, b) {
        return a.width - b.width;
    }).pop();

    sendLog("Thumbnail selected", thumbnail);

    const {audioBitrate} = format;
    const destination = getDestination(title);

    const tags = {
        title: title,
        artist: author.name,
        performerInfo: author.name, // album artist
        album: "Youtube",
        genre: category,
        artistUrl: [author.channel_url],
        audioSourceUrl: video_url,
        publisherUrl: video_url,
        year: new Date(publishDate).getFullYear(),
        TSSE: "LAME"
    }

    sendLog("Save as:", destination);

    const stream = ytdl.downloadFromInfo(info, {quality: quality});
    ffmpeg(stream)
        .audioBitrate(audioBitrate)
        // .audioFilters('volume=0.5')
        .withAudioCodec("libmp3lame")
        .toFormat("mp3")
        .save(destination)
        // .on("start", function(commandLine) {
        //     sendLog("Spawned Ffmpeg with command: " + commandLine);
        // })
        // .on("stderr", function(stderrLine) {
        //     sendLog('Stderr output: ' + stderrLine);
        // })
        .on("error", function(err, stdout, stderr) {
            sendErr(err);

            fs.unlink(destination, function() {
                // fix error
            });
            subIndex();
            inProgress = false;
            exec();
        })
        .on("end", async function() {
            sendLog("Download completed.");

            try {
                await setTags(destination, tags, thumbnail);
                sendLog("Tag set.");
            } catch(err) {
                sendErr("Tag has not been set.");
            }

            subIndex();
            inProgress = false;
            exec();
        });
}
function copyHandler() {
    const text = clipboard.readText();
    if (!isLoaded) {
        sendErr("App is not loaded.");
    } else if (isYoutubeURL(text)) {
        sendLog("You are copy youtube url.", text);
        createJob(text);
    } else {
        sendErr("URL is not youtube URL.", text);
    }
}
function removeCopyHandler() {
    clipboard.off("text-changed");
    clipboard.stopWatching();
}

// express server
// require("./server");