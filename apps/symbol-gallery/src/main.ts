import { mountSymbolGallery } from "./symbol-gallery.js";
import { createStandardSymbolCategoryRegistry } from "@web-scada/symbols";
import "./style.css";

const gallery = document.querySelector<HTMLElement>("#gallery");
if (gallery === null) throw new Error("Symbol gallery root was not found.");

const galleryController = mountSymbolGallery(gallery);

const stateSelect = document.querySelector<HTMLSelectElement>("#state-select");
const sizeToggle = document.querySelector<HTMLButtonElement>("#size-toggle");
const search = document.querySelector<HTMLInputElement>("#gallery-search");
const categorySelect = document.querySelector<HTMLSelectElement>("#category-select");
const variantSelect = document.querySelector<HTMLSelectElement>("#variant-select");
const rotationSelect = document.querySelector<HTMLSelectElement>("#rotation-select");
const themeToggle = document.querySelector<HTMLButtonElement>("#theme-toggle");
if (
  stateSelect === null ||
  sizeToggle === null ||
  search === null ||
  categorySelect === null ||
  variantSelect === null ||
  rotationSelect === null ||
  themeToggle === null
)
  throw new Error("Gallery controls were not found.");

for (const category of createStandardSymbolCategoryRegistry().list()) {
  const option = document.createElement("option");
  option.value = category.id;
  option.textContent = category.displayName;
  categorySelect.append(option);
}

stateSelect.addEventListener("change", () => {
  galleryController.setState(stateSelect.value);
});
search.addEventListener("input", () => {
  galleryController.setSearch(search.value);
});
categorySelect.addEventListener("change", () => {
  galleryController.setCategory(categorySelect.value);
});
variantSelect.addEventListener("change", () => {
  galleryController.setVariant(variantSelect.value);
});
rotationSelect.addEventListener("change", () => {
  galleryController.setRotation(Number(rotationSelect.value));
});

let theme: "dark" | "light" = "dark";
themeToggle.addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  galleryController.setTheme(theme);
  themeToggle.textContent = theme === "dark" ? "Use light theme" : "Use dark theme";
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
