"use strict";

const byId = (id) => document.getElementById(id);
const selected = (name) => document.querySelector(`input[name="${name}"]:checked`);
const sampleLink = "https://example.com";
const defaults = { foreground: "#003E1F", background: "#FFFFFF", style: "square", size: 1024, correction: "M" };

const editor = byId("editor");
const linkInput = byId("link-value");
const textInput = byId("text-value");
const generateButton = editor.querySelector('button[type="submit"]');
const canvas = byId("qr-preview");
const context = canvas.getContext("2d");
const contentError = byId("content-error");
const colorMessage = byId("color-message");
const downloadButton = byId("download");
const downloadError = byId("download-error");
const previewMediaLink = byId("preview-media-link");
const mediaInputs = Object.fromEntries(["image", "audio"].map((type) => [type, {
  url: byId(`${type}-value`),
  file: byId(`${type}-file`),
  wrap: byId(`${type}-wrap`),
  linkToggle: byId(`${type}-link-toggle`),
  linkOption: byId(`${type}-link-option`),
}]));
const mediaFormat = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg",
  m4a: "audio/mp4", flac: "audio/flac",
};
const mediaSize = { image: 10, audio: 25 };
const cloudName = document.querySelector('[name="qrs-storage-cloud"]').content.trim();
const cloudPreset = document.querySelector('[name="qrs-storage-preset"]').content.trim();
const hasCloudStorage = [cloudName, cloudPreset].every((value) => /^[\w-]+$/.test(value));
const uploadedFiles = new WeakMap();
const colors = {
  foreground: { picker: byId("foreground-picker"), hex: byId("foreground-hex") },
  background: { picker: byId("background-picker"), hex: byId("background-hex") },
};
const statusLabels = { example: "Exemplo", pending: "Aguardando", uploading: "Enviando", loading: "Gerando", ready: "Pronto" };

let active = { type: "link", source: sampleLink, payload: `${sampleLink}/`, isExample: true };
let cachedMatrix;
let pendingRequest;
let pendingUpload;
let previewAvailable = false;
let downloading = false;

function getDraft() {
  const type = selected("content-type").value;
  const media = mediaInputs[type];
  if (media) {
    const file = media.file.files[0];
    const input = file || media.linkOption.hidden ? media.file : media.url;
    return { type, input, source: file ?? input.value.trim(), file };
  }
  const input = type === "link" ? linkInput : textInput;
  return { type, input, source: type === "text" ? input.value : input.value.trim() };
}

function validateContent(draft) {
  if (!draft.source.trim()) {
    if (draft.type === "text") throw new Error("Digite um texto para gerar o QR Code.");
    if (mediaInputs[draft.type]) throw new Error("Escolha um arquivo ou use um link público.");
    throw new Error("Digite um endereço para gerar o QR Code.");
  }
  if (draft.type === "text") return draft.source;

  try {
    if (/\s/.test(draft.source)) throw new Error();
    const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(draft.source);
    const address = new URL(hasScheme ? draft.source : `https://${draft.source.replace(/^\/\//, "")}`);
    if (!["http:", "https:"].includes(address.protocol)) throw new Error();
    if (mediaInputs[draft.type] && (address.username || address.password)) throw new Error();
    return address.href;
  } catch {
    throw new Error("Digite um endereço válido, como https://seusite.com.");
  }
}

function showContentError(message = "", input = getDraft().input) {
  editor.querySelectorAll(".content-field [aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
  contentError.textContent = message;
  contentError.hidden = !message;
  if (message) input.setAttribute("aria-invalid", "true");
}

function validateFile(file, type) {
  const extension = file.name.split(".").pop().toLowerCase();
  const mime = Object.hasOwn(mediaFormat, extension) ? mediaFormat[extension] : "";
  if (!mime.startsWith(`${type}/`)) throw new Error("Escolha um arquivo em um dos formatos indicados.");
  if (!file.size) throw new Error("O arquivo está vazio. Escolha outro arquivo.");
  if (file.size > mediaSize[type] * 1_000_000) throw new Error(`O arquivo deve ter até ${mediaSize[type]} MB.`);
  return mime;
}

async function uploadToCloud({ file, type }, signal) {
  const resource = type === "audio" ? "video" : "image";
  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", cloudPreset);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resource}/upload`, { method: "POST", body, signal });
  if (!response.ok) throw new Error("Não foi possível publicar o arquivo. Tente novamente ou use um link público.");
  const data = await response.json();
  const url = new URL(data.secure_url);
  if (url.origin !== "https://res.cloudinary.com" || !url.pathname.startsWith(`/${cloudName}/${resource}/upload/`)) {
    throw new Error("O armazenamento não retornou um link público para o arquivo.");
  }
  return url;
}

async function uploadPublicMedia({ file, type }, mime, signal) {
  const extension = file.name.split(".").pop().toLowerCase();
  const name = type === "image" ? `imagem.${extension}` : `audio.${extension}`;
  const body = new FormData();
  body.set("file", new Blob([file], { type: mime }), name);
  const response = await fetch("https://waifuvault.moe/rest?expires=30d", {
    method: "PUT", body, signal, referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error("Não foi possível criar o link público. Tente novamente.");
  const data = await response.json();
  const url = new URL(data.url);
  if (url.origin !== "https://waifuvault.moe" || !url.pathname.startsWith("/f/")) {
    throw new Error("O armazenamento não retornou um link público para o arquivo.");
  }
  return url;
}

async function uploadMedia(draft, mime, signal) {
  if (uploadedFiles.has(draft.file)) return uploadedFiles.get(draft.file);
  const url = hasCloudStorage ? await uploadToCloud(draft, signal) : await uploadPublicMedia(draft, mime, signal);
  uploadedFiles.set(draft.file, url.href);
  return url.href;
}

function getAppearance() {
  return {
    foreground: colors.foreground.picker.value,
    background: colors.background.picker.value,
    style: selected("style").value,
    size: Number(byId("size").value),
    correction: byId("correction").value,
  };
}

function colorIsValid(value) {
  return /^#?[\da-f]{6}$/i.test(value.trim());
}

function hexColor(value) {
  return `#${value.trim().replace(/^#/, "").toUpperCase()}`;
}

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function updateColorMessage() {
  const invalid = Object.values(colors).some(({ hex }) => !colorIsValid(hex.value));
  const look = getAppearance();
  const contrast = (luminance(look.background) + 0.05) / (luminance(look.foreground) + 0.05);
  const message = invalid
    ? "Use seis dígitos hexadecimais, como #003E1F."
    : contrast < 3 ? "Para facilitar a leitura, escolha um QR escuro e um fundo mais claro." : "";
  colorMessage.textContent = message;
  colorMessage.hidden = !message;
  colorMessage.classList.toggle("error", invalid);
  return !invalid;
}

function getMatrix(payload, correction) {
  if (cachedMatrix?.payload === payload && cachedMatrix.correction === correction) return cachedMatrix.matrix;

  const { QrCode, QrSegment } = qrcodegen;
  const levels = { L: QrCode.Ecc.LOW, M: QrCode.Ecc.MEDIUM, Q: QrCode.Ecc.QUARTILE, H: QrCode.Ecc.HIGH };
  const segments = QrSegment.makeSegments(payload);
  if (/[^\x00-\x7f]/.test(payload)) segments.unshift(QrSegment.makeEci(26));
  const matrix = QrCode.encodeSegments(segments, levels[correction], 1, 40, -1, false);
  cachedMatrix = { payload, correction, matrix };
  return matrix;
}

function fitCanvas(size) {
  if (canvas.width !== size) canvas.width = canvas.height = size;
  context.imageSmoothingEnabled = false;
}

function drawMatrix(matrix, look) {
  fitCanvas(look.size);
  context.fillStyle = look.background;
  context.fillRect(0, 0, look.size, look.size);
  context.fillStyle = look.foreground;

  const modules = matrix.size;
  const edge = Math.floor(look.size / (modules + 8));
  const inset = Math.floor((look.size - modules * edge) / 2);
  const alignmentCenters = matrix.getAlignmentPatternPositions();
  const alignmentAxes = Array.from({ length: modules }, (_, index) => (
    alignmentCenters.some((center) => Math.abs(index - center) <= 2)
  ));

  for (let row = 0; row < modules; row++) {
    for (let column = 0; column < modules; column++) {
      if (!matrix.getModule(column, row)) continue;
      const x = inset + column * edge;
      const y = inset + row * edge;
      const nearFinder = (row < 9 && (column < 9 || column >= modules - 8)) || (column < 9 && row >= modules - 8);
      const isTiming = row === 6 || column === 6;
      const isAlignment = alignmentAxes[row] && alignmentAxes[column];

      if (look.style === "square" || nearFinder || isTiming || isAlignment) {
        context.fillRect(x, y, edge, edge);
      } else {
        context.beginPath();
        if (look.style === "dot") {
          context.arc(x + edge / 2, y + edge / 2, edge * 0.45, 0, 2 * Math.PI);
        } else {
          context.roundRect(x, y, edge, edge, edge * 0.28);
        }
        context.fill();
      }
    }
  }
}

async function fetchQuickChart(payload, look, signal) {
  const url = new URL("https://quickchart.io/qr");
  url.search = new URLSearchParams({
    text: payload,
    format: "png",
    size: look.size,
    margin: 4,
    ecLevel: look.correction,
    dark: look.foreground.slice(1),
    light: look.background.slice(1),
    dotStyle: look.style,
    finderStyle: "square",
    finderDotStyle: "square",
  });

  const response = await fetch(url, { signal, cache: "no-store", referrerPolicy: "no-referrer" });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png")) {
    throw new Error("O QuickChart não retornou uma imagem PNG.");
  }
  return createImageBitmap(await response.blob());
}

function updatePreviewState() {
  const draft = getDraft();
  const changed = draft.type !== active.type || draft.source !== active.source;
  const validColors = updateColorMessage();
  let state = active.isExample ? "example" : "ready";
  let message = "Aponte a câmera do celular para testar.";

  if (pendingUpload) {
    state = "uploading";
    message = "Enviando o arquivo para gerar seu QR Code.";
  } else if (changed) {
    state = "pending";
    message = "Gere novamente para atualizar o conteúdo da prévia.";
  } else if (pendingRequest) {
    state = "loading";
    message = "Gerando seu QR Code.";
  } else if (!previewAvailable) {
    state = "pending";
    message = "Reduza o conteúdo ou o nível de correção de erros.";
  }

  const status = byId("preview-status");
  status.dataset.state = state;
  status.textContent = statusLabels[state];
  byId("preview-note-text").textContent = message;
  byId("preview-note").querySelector(".icon").hidden = state === "pending" || state === "uploading" || state === "loading";
  canvas.setAttribute("aria-label", active.isExample ? "Prévia do QR Code de exemplo" : "Prévia do QR Code gerado");
  generateButton.disabled = !!pendingUpload;
  downloadButton.disabled = changed || !!pendingUpload || !!pendingRequest || !previewAvailable || !validColors || downloading;
  previewMediaLink.hidden = state !== "ready" || !mediaInputs[active.type];
  if (!previewMediaLink.hidden) {
    previewMediaLink.href = active.payload;
    previewMediaLink.textContent = active.type === "image" ? "Abrir imagem" : "Abrir áudio";
  }
}

function updateAppearance() {
  pendingRequest?.abort();
  pendingRequest = undefined;
  downloadError.hidden = true;
  const look = getAppearance();

  try {
    drawMatrix(getMatrix(active.payload, look.correction), look);
    previewAvailable = true;
  } catch {
    previewAvailable = false;
    fitCanvas(look.size);
    context.fillStyle = look.background;
    context.fillRect(0, 0, look.size, look.size);
  }
  updatePreviewState();
}

function updateDraft() {
  const { type, source } = getDraft();
  const isLink = type === "link";
  byId("link-label").hidden = !isLink;
  byId("link-wrap").hidden = !isLink;
  byId("text-wrap").hidden = type !== "text";
  for (const [mediaType, { wrap }] of Object.entries(mediaInputs)) wrap.hidden = type !== mediaType;
  if (pendingUpload && (pendingUpload.type !== type || pendingUpload.file !== source)) {
    pendingUpload.controller.abort();
    pendingUpload = undefined;
  }
  byId("text-count").textContent = `${textInput.value.length} / ${textInput.maxLength}`;
  showContentError();
  downloadError.hidden = true;
  updatePreviewState();
}

editor.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (pendingUpload) return;
  const draft = getDraft();
  let mime;
  let payload;
  try {
    if (draft.file) mime = validateFile(draft.file, draft.type);
    else payload = validateContent(draft);
  } catch (error) {
    showContentError(error.message, draft.input);
    draft.input.focus();
    return;
  }

  if (!updateColorMessage()) {
    Object.values(colors).find(({ hex }) => !colorIsValid(hex.value)).hex.focus();
    return;
  }

  showContentError();
  if (draft.file) {
    const controller = new AbortController();
    const upload = { type: draft.type, file: draft.file, controller };
    pendingUpload = upload;
    const timeout = setTimeout(() => controller.abort(), 120_000);
    updatePreviewState();

    try {
      payload = await uploadMedia(draft, mime, controller.signal);
      if (pendingUpload !== upload) return;
    } catch (error) {
      if (pendingUpload === upload) {
        const message = error instanceof TypeError || error instanceof SyntaxError || controller.signal.aborted
          ? "Não foi possível enviar o arquivo. Tente novamente."
          : error.message;
        showContentError(message, draft.input);
        draft.input.focus();
      }
      return;
    } finally {
      clearTimeout(timeout);
      if (pendingUpload === upload) {
        pendingUpload = undefined;
        updatePreviewState();
      }
    }
  }

  active = { type: draft.type, source: draft.source, payload, isExample: false };
  updateAppearance();
  if (mediaInputs[draft.type]) return;
  const look = getAppearance();
  const request = new AbortController();
  pendingRequest = request;
  const timeout = setTimeout(() => request.abort(), 5500);
  updatePreviewState();

  try {
    const image = await fetchQuickChart(payload, look, request.signal);
    try {
      if (pendingRequest !== request) return;
      if (image.width !== look.size || image.height !== look.size) throw new Error("Tamanho inesperado.");
      fitCanvas(look.size);
      context.clearRect(0, 0, look.size, look.size);
      context.drawImage(image, 0, 0);
      previewAvailable = true;
    } finally {
      image.close();
    }
  } catch {
    // Aproveita a prévia local quando a geração externa falha.
  } finally {
    clearTimeout(timeout);
    if (pendingRequest === request) {
      pendingRequest = undefined;
      updatePreviewState();
    }
  }
});

for (const input of [linkInput, textInput]) input.addEventListener("input", updateDraft);
function setMediaLinkOpen({ linkToggle, linkOption }, open) {
  linkOption.hidden = !open;
  linkToggle.setAttribute("aria-expanded", String(open));
}

for (const media of Object.values(mediaInputs)) {
  const { url, file, linkToggle, linkOption } = media;
  linkToggle.addEventListener("click", () => {
    const open = linkOption.hidden;
    setMediaLinkOpen(media, open);
    updateDraft();
    if (open) url.focus();
  });
  url.addEventListener("input", () => {
    if (url.value.trim()) file.value = "";
    updateDraft();
  });
  file.addEventListener("change", () => {
    if (file.files.length) {
      url.value = "";
      setMediaLinkOpen(media, false);
    }
    updateDraft();
  });
}
for (const option of document.querySelectorAll('[name="content-type"]')) option.addEventListener("change", updateDraft);
for (const option of document.querySelectorAll('[name="style"], #size, #correction')) option.addEventListener("change", updateAppearance);

for (const { picker, hex } of Object.values(colors)) {
  picker.addEventListener("input", () => {
    hex.value = picker.value.toUpperCase();
    hex.removeAttribute("aria-invalid");
    updateAppearance();
  });
  hex.addEventListener("input", () => {
    if (!colorIsValid(hex.value)) {
      hex.setAttribute("aria-invalid", "true");
      updatePreviewState();
      return;
    }
    hex.removeAttribute("aria-invalid");
    picker.value = hexColor(hex.value);
    updateAppearance();
  });
  hex.addEventListener("blur", () => {
    if (colorIsValid(hex.value)) hex.value = hexColor(hex.value);
  });
}

byId("reset-look").addEventListener("click", () => {
  for (const [name, { picker, hex }] of Object.entries(colors)) {
    picker.value = hex.value = defaults[name];
    hex.removeAttribute("aria-invalid");
  }
  editor.elements.style.value = defaults.style;
  byId("size").value = defaults.size;
  byId("correction").value = defaults.correction;
  updateAppearance();
});

function getImageBlob(type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob?.type === type) resolve(blob);
      else reject(new Error("Falha ao exportar a imagem."));
    }, type, quality);
  });
}

async function createPdf() {
  const size = canvas.width;
  const image = await getImageBlob("image/jpeg", 1);
  const page = 288;
  const print = `q\n${page} 0 0 ${page} 0 0 cm\n/QR Do\nQ\n`;
  const encoder = new TextEncoder();
  const parts = [];
  let length = 0;

  function append(part) {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    length += bytes.byteLength ?? bytes.size;
    parts.push(bytes);
  }

  append("%PDF-1.4\n");
  append(new Uint8Array([37, 226, 227, 207, 211, 10]));

  const objects = [
    ["<< /Type /Catalog /Pages 2 0 R >>"],
    ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
    [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page} ${page}] /Resources << /XObject << /QR 4 0 R >> >> /Contents 5 0 R >>`],
    [`<< /Type /XObject /Subtype /Image /Width ${size} /Height ${size} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.size} >>\nstream\n`, image, "\nendstream"],
    [`<< /Length ${print.length} >>\nstream\n`, print, "endstream"],
  ];
  const offsets = objects.map((object, index) => {
    const offset = length;
    append(`${index + 1} 0 obj\n`);
    object.forEach(append);
    append("\nendobj\n");
    return offset;
  });
  const crossReference = length;
  append(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
  offsets.forEach((offset) => append(`${String(offset).padStart(10, "0")} 00000 n \n`));
  append(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${crossReference}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" });
}

downloadButton.addEventListener("click", async () => {
  const format = selected("format").value;
  downloading = true;
  downloadError.hidden = true;
  updatePreviewState();

  try {
    const blob = format === "pdf" ? await createPdf() : await getImageBlob(format === "jpg" ? "image/jpeg" : "image/png", 0.98);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `qrs-code.${format}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch {
    downloadError.textContent = "Não foi possível baixar o arquivo. Tente novamente.";
    downloadError.hidden = false;
  } finally {
    downloading = false;
    updatePreviewState();
  }
});

updateAppearance();
updateDraft();
