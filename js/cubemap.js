const CubeMapApp = (() => {
    // 画像データの描画と操作に使用されるHTML canvas要素とその2Dコンテキストを作成します。
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    let loadedFileName = "";

    // 特定のIDを持つHTML要素をラップし、その要素が変更されたときに指定されたコールバック関数を呼び出します。
    class Input {
        constructor(id, onChange) {
            this.input = document.getElementById(id);
            this.input.addEventListener("change", onChange);
            this.valueAttrib =
                this.input.type === "checkbox" ? "checked" : "value";
        }

        get value() {
            return this.input[this.valueAttrib];
        }
    }

    // キューブマップの各面を表現し、プレビューとダウンロードのリンクを作成します。
    class CubeFace {
        constructor(faceName) {
            this.faceName = faceName;
            this.anchor = document.createElement("a");
            this.anchor.style.position = "absolute";
            this.anchor.title = faceName;
            this.img = document.createElement("img");
            this.img.style.filter = "blur(4px)";
            this.anchor.appendChild(this.img);
        }

        setPreview(url, x, y) {
            this.img.src = url;
            this.anchor.style.left = `${x}px`;
            this.anchor.style.top = `${y}px`;
        }

        setDownload(url) {
            this.anchor.href = url;
            this.anchor.download = `${loadedFileName}_${this.faceName}.png`;
            this.img.style.filter = "";
        }
    }

    const mimeType = {
        png: "image/png",
    };

    // 画像データの処理
    async function getDataURL(imgData) {
        canvas.width = imgData.width;
        canvas.height = imgData.height;
        ctx.putImageData(imgData, 0, 0);
        return new Promise((resolve) => {
            canvas.toBlob(
                (blob) => resolve(URL.createObjectURL(blob)),
                mimeType["png"],
                0.92
            );
        });
    }

    // DOMの操作
    function removeChildren(node) {
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }

    // アプリケーションで使用される主要なDOM要素への参照を保持します。
    const dom = {
        imageInput: document.getElementById("imageInput"),
        dropzone: document.getElementById("dropzone"), 
        faces: document.getElementById("faces"),
        generating: document.getElementById("generating"),
        fileNameDisplay: document.getElementById("fileNameDisplay"),
        errorMessage: document.getElementById("errorMessage"),
    };

    // キューブの回転を制御するInputインスタンスを保持します。
    const settings = {
        cubeRotation: new Input("cubeRotation", loadImage),
    };

    // キューブマップの各面の位置を定義します。
    const facePositions = {
        skyboxRt: { x: 1, y: 1 },
        skyboxLf: { x: 3, y: 1 },
        skyboxFt: { x: 2, y: 1 },
        skyboxBk: { x: 0, y: 1 },
        skyboxUp: { x: 1, y: 0 },
        skyboxDn: { x: 1, y: 2 },
    };

    // ファイル選択のイベントリスナー
    dom.imageInput.addEventListener("change", loadImage);

    // New drag and drop event listeners
    dom.dropzone.addEventListener("dragover", (event) => {
        event.preventDefault();
        dom.dropzone.classList.add("dragging");
    });

    dom.dropzone.addEventListener("dragleave", () => {
        dom.dropzone.classList.remove("dragging");
    });

    dom.dropzone.addEventListener("drop", (event) => {
        event.preventDefault();
        dom.dropzone.classList.remove("dragging");

        // Clear any existing error message
        dom.errorMessage.textContent = "";

        const files = event.dataTransfer.files;
        if (files.length > 1) {
            dom.errorMessage.textContent =
                "アップロードできるファイルはひとつだけです。";
            return;
        }

        const file = files[0];
        if (file && file.type.startsWith("image/")) {
            dom.imageInput.files = event.dataTransfer.files;
            loadImage();
        }
    });

    // アップロードされた画像を読み込み、processImage関数を呼び出して画像データを処理します。
    function loadImage() {
        const file = getFile();
        if (!file) return;
        displayFileName(file);

        const img = new Image();
        img.src = URL.createObjectURL(file);

        img.addEventListener("load", () => {
            const { width, height } = img;
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0);
            const data = ctx.getImageData(0, 0, width, height);

            processImage(data);
        });
    }

    function getFile() {
        return dom.imageInput.files[0];
    }

    function displayFileName(file) {
        dom.fileNameDisplay.textContent = file.name;
        loadedFileName = file.name.split(".")[0];
    }

    let finished = 0;
    let workers = [];

    function processImage(data) {
        removeChildren(dom.faces);
        dom.generating.style.visibility = "visible";
        workers.forEach((worker) => worker.terminate());

        Object.entries(facePositions).forEach(([faceName, position]) => {
            renderFace(data, faceName, position);
        });
    }

    // 指定されたキューブ面をレンダリングし、プレビューとダウンロードリンクを作成します。
    // Web Workerを使用して、画像変換処理を非同期に実行します。
    function renderFace(data, faceName, position) {
        const face = new CubeFace(faceName);
        dom.faces.appendChild(face.anchor);

        const options = {
            data,
            face: faceName,
            rotation: (Math.PI * settings.cubeRotation.value) / 180,
            interpolation: "lanczos",
        };

        const worker = new Worker("js/convert.js");

        const setDownload = async ({ data: imageData }) => {
            const url = await getDataURL(imageData);
            face.setDownload(url);

            finished++;
            if (finished === 6) {
                dom.generating.style.visibility = "hidden";
                finished = 0;
                workers = [];
            }
        };

        const setPreview = async ({ data: imageData }) => {
            const x = imageData.width * position.x;
            const y = imageData.height * position.y;
            const url = await getDataURL(imageData);
            face.setPreview(url, x, y);

            worker.onmessage = setDownload;
            worker.postMessage(options);
        };

        worker.onmessage = setPreview;
        worker.postMessage({
            ...options,
            maxWidth: 200,
            interpolation: "linear",
        });

        workers.push(worker);
    }

    document
        .getElementById("downloadAllLink")
        .addEventListener("click", function (event) {
            event.preventDefault();
            downloadAllImagesAsZip();
        });

    return {
        loadImage,
    };
})();

