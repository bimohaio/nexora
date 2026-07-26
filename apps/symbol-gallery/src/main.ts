import { mountSymbolGallery } from "./symbol-gallery.js";
import "./style.css";

const gallery = document.querySelector<HTMLElement>("#gallery");
if (gallery === null) throw new Error("Symbol gallery root was not found.");

const galleryController = mountSymbolGallery(gallery);

const stateSelect = document.querySelector<HTMLSelectElement>("#state-select");
const sizeToggle = document.querySelector<HTMLButtonElement>("#size-toggle");
if (stateSelect === null || sizeToggle === null)
  throw new Error("Gallery controls were not found.");

stateSelect.addEventListener("change", () => {
  galleryController.setState(stateSelect.value);
});

let minimumSize = false;
sizeToggle.addEventListener("click", () => {
  minimumSize = !minimumSize;
  galleryController.setMinimumSize(minimumSize);
  sizeToggle.textContent = minimumSize ? "Show default sizes" : "Show minimum sizes";
});

window.addEventListener("beforeunload", () => {
  galleryController.dispose();
});
