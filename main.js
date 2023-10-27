const CubeMapApp = (() => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let loadedFileName = "";

  class Input {
      constructor(id, onChange) {
          this.input = document.getElementById(id);
          this.input.addEventListener("change", onChange);
          this.valueAttrib = this.input.type === "checkbox" ? "checked" : "value";
      }

      get value() {
          return this.input[this.valueAttrib];
      }
  }

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

  async function getDataURL(imgData) {
      canvas.width = imgData.width;
      canvas.height = imgData.height;
      ctx.putImageData(imgData, 0, 0);
      return new Promise((resolve) => {
          canvas.toBlob((blob) => resolve(URL.createObjectURL(blob)), mimeType["png"], 0.92);
      });
  }

  function removeChildren(node) {
      while (node.firstChild) {
          node.removeChild(node.firstChild);
      }
  }

  const dom = {
      imageInput: document.getElementById("imageInput"),
      faces: document.getElementById("faces"),
      generating: document.getElementById("generating"),
      fileNameDisplay: document.getElementById("fileNameDisplay")
  };

  const settings = {
      cubeRotation: new Input("cubeRotation", loadImage),
  };

  const facePositions = {
      skyboxRt: { x: 1, y: 1 },
      skyboxLf: { x: 3, y: 1 },
      skyboxFt: { x: 2, y: 1 },
      skyboxBk: { x: 0, y: 1 },
      skyboxUp: { x: 1, y: 0 },
      skyboxDn: { x: 1, y: 2 },
  };

  dom.imageInput.addEventListener("change", loadImage);

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

  function renderFace(data, faceName, position) {
      const face = new CubeFace(faceName);
      dom.faces.appendChild(face.anchor);

      const options = {
          data,
          face: faceName,
          rotation: (Math.PI * settings.cubeRotation.value) / 180,
          interpolation: "lanczos",
      };

      const worker = new Worker("convert.js");

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
      worker.postMessage({ ...options, maxWidth: 200, interpolation: "linear" });

      workers.push(worker);
  }

  async function downloadAllImagesAsZip() {
      const zip = new JSZip();

      for (let faceName in facePositions) {
          const face = document.querySelector(`a[title="${faceName}"] img`);
          const imgData = await fetch(face.src).then((r) => r.blob());
          zip.file(`${loadedFileName}_${faceName}.png`, imgData, {
              binary: true,
          });
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipURL = URL.createObjectURL(zipBlob);

      const a = document.createElement("a");
      a.style.display = "none";
      a.href = zipURL;
      a.download = `${loadedFileName}_cubemap.zip`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  }

  document.getElementById("downloadAllLink").addEventListener("click", function (event) {
      event.preventDefault();
      downloadAllImagesAsZip();
  });

  return {
      loadImage,
      downloadAllImagesAsZip
  };
})();


