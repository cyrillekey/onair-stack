(() => {
  "use strict";

  const page = document.querySelector("[data-configure]");
  if (!page) return;

  const form = page.querySelector("[data-config-form]");
  if (!form) return;

  const usernameInput = page.querySelector("[data-username]");
  const generateButton = page.querySelector("[data-generate]");
  const generateLabel = page.querySelector("[data-generate-label]");
  const previewName = page.querySelector("[data-preview-name]");
  const previewCountries = page.querySelector("[data-preview-countries]");
  const previewCountryCount = page.querySelector("[data-preview-country-count]");
  const previewGenres = page.querySelector("[data-preview-genres]");
  const previewGenreCount = page.querySelector("[data-preview-genre-count]");
  const previewHome = page.querySelector("[data-preview-home]");
  const previewHomeLabel = page.querySelector("[data-preview-home-label]");
  const previewTimezone = page.querySelector("[data-preview-timezone]");
  const previewError = page.querySelector("[data-preview-error]");
  const previewResult = page.querySelector("[data-preview-result]");
  const manifestUrl = page.querySelector("[data-manifest-url]");
  const copyButton = page.querySelector("[data-copy-link]");
  const copyLabel = page.querySelector("[data-copy-label]");
  const openStremio = page.querySelector("[data-open-stremio]");
  const homeRadios = Array.from(
    form.querySelectorAll('input[name="showOnHome"]'),
  );

  const timezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  })();

  class TagField {
    constructor(root) {
      this.root = root;
      this.name = root.dataset.name;
      this.label = root.dataset.label || this.name;
      this.shell = root.querySelector("[data-tag-shell]");
      this.chips = root.querySelector("[data-tag-chips]");
      this.placeholder = root.querySelector("[data-tag-placeholder]");
      this.toggle = root.querySelector("[data-tag-toggle]");
      this.count = root.querySelector("[data-tag-count]");
      this.popover = root.querySelector("[data-tag-popover]");
      this.search = root.querySelector("[data-tag-search]");
      this.options = Array.from(root.querySelectorAll("[data-tag-option]"));
      this.rows = Array.from(root.querySelectorAll("[data-tag-option-row]"));
      this.visibleCount = root.querySelector("[data-tag-visible-count]");
      this.empty = root.querySelector("[data-tag-empty]");
      this.selectAll = root.querySelector("[data-tag-all]");
      this.clear = root.querySelector("[data-tag-none]");

      this.bind();
      this.render(false);
      TagField.instances.push(this);
    }

    get values() {
      return this.options
        .filter((option) => option.checked)
        .map((option) => option.value);
    }

    selectedOptions() {
      return this.options
        .filter((option) => option.checked)
        .map((option) => ({
          value: option.value,
          label: option.dataset.label || option.value,
        }));
    }

    isOpen() {
      return !this.popover.hidden;
    }

    bind() {
      this.shell.addEventListener("click", (event) => {
        if (event.target.closest("[data-chip-remove]")) return;
        if (event.target.closest("[data-tag-toggle]")) return;
        this.open();
      });

      this.toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        if (this.isOpen()) {
          this.close();
        } else {
          this.open();
        }
      });

      this.search.addEventListener("input", () => {
        this.filter(this.search.value);
      });

      this.search.addEventListener("keydown", (event) => {
        if (event.key === "Enter") event.preventDefault();
      });

      this.options.forEach((option) => {
        option.addEventListener("change", () => this.render());
      });

      this.selectAll.addEventListener("click", () => {
        this.setAll(true);
        this.search.focus();
      });

      this.clear.addEventListener("click", () => {
        this.setAll(false);
        this.search.focus();
      });
    }

    open() {
      TagField.instances.forEach((field) => {
        if (field !== this) field.close();
      });
      this.popover.hidden = false;
      this.shell.classList.add("is-open");
      this.toggle.setAttribute("aria-expanded", "true");
      this.search.value = "";
      this.filter("");
      window.setTimeout(() => {
        this.search.focus({ preventScroll: true });
      }, 0);
    }

    close() {
      if (!this.isOpen()) return;
      this.popover.hidden = true;
      this.shell.classList.remove("is-open");
      this.toggle.setAttribute("aria-expanded", "false");
    }

    setAll(checked) {
      this.options.forEach((option) => {
        option.checked = checked;
      });
      this.render();
    }

    setChecked(value, checked) {
      const option = this.options.find((item) => item.value === value);
      if (!option) return;
      option.checked = checked;
      this.render();
    }

    filter(query) {
      const term = query.trim().toLowerCase();
      let visible = 0;

      this.rows.forEach((row) => {
        const option = row.querySelector("[data-tag-option]");
        const label = (option?.dataset.label || "").toLowerCase();
        const match = !term || label.includes(term);
        row.hidden = !match;
        if (match) visible += 1;
      });

      this.empty.hidden = visible > 0;
      this.visibleCount.textContent = `${visible} of ${this.options.length}`;
    }

    render(announce = true) {
      const selected = this.selectedOptions();

      this.chips.replaceChildren();

      selected.slice(0, 4).forEach(({ value, label }) => {
        const chip = document.createElement("span");
        chip.className = "tag-chip";

        const text = document.createElement("span");
        text.textContent = label;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "tag-chip-remove";
        remove.dataset.chipRemove = value;
        remove.setAttribute("aria-label", `Remove ${label}`);
        remove.innerHTML =
          '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="m2 2 6 6M8 2 2 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
        remove.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.setChecked(value, false);
        });

        chip.append(text, remove);
        this.chips.append(chip);
      });

      if (selected.length > 4) {
        const more = document.createElement("span");
        more.className = "tag-chip tag-chip-more";
        more.textContent = `+${selected.length - 4}`;
        more.title = selected
          .slice(4)
          .map((option) => option.label)
          .join(", ");
        this.chips.append(more);
      }

      this.placeholder.hidden = selected.length > 0;
      this.count.textContent = `${selected.length} / ${this.options.length}`;
      this.toggle.setAttribute(
        "aria-label",
        `${this.label}: ${selected.length} of ${this.options.length} selected`,
      );

      if (announce) {
        this.root.dispatchEvent(
          new CustomEvent("tagchange", {
            bubbles: true,
            detail: { name: this.name, values: this.values },
          }),
        );
      }
    }
  }

  TagField.instances = [];

  const tagFields = new Map();
  page.querySelectorAll("[data-tag-field]").forEach((root) => {
    const field = new TagField(root);
    tagFields.set(field.name, field);
  });

  function getShowOnHome() {
    const checked = homeRadios.find((radio) => radio.checked);
    return checked ? checked.value === "true" : true;
  }

  function updateChoiceCards() {
    form.querySelectorAll(".choice-card").forEach((card) => {
      const input = card.querySelector('input[name="showOnHome"]');
      card.classList.toggle("is-selected", Boolean(input?.checked));
    });
  }

  function setGenerateLabel(label) {
    generateLabel.textContent = label;
  }

  function setFieldError(name, message) {
    const error = page.querySelector(`[data-error="${name}"]`);
    if (!error) return;
    error.textContent = message;
    error.hidden = false;

    if (name === "username") {
      usernameInput.closest(".text-control")?.classList.add("has-error");
    } else {
      tagFields.get(name)?.shell.classList.add("has-error");
    }
  }

  function clearFieldError(name) {
    const error = page.querySelector(`[data-error="${name}"]`);
    if (error) {
      error.hidden = true;
      error.textContent = "";
    }

    if (name === "username") {
      usernameInput.closest(".text-control")?.classList.remove("has-error");
    } else {
      tagFields.get(name)?.shell.classList.remove("has-error");
    }
  }

  function clearFieldErrors() {
    clearFieldError("username");
    clearFieldError("countries");
    clearFieldError("categories");
  }

  function clearResult() {
    if (!previewResult.hidden) {
      previewResult.hidden = true;
      manifestUrl.textContent = "";
      copyButton.dataset.url = "";
      openStremio.setAttribute("href", "#");
    }
    copyButton.classList.remove("is-copied");
    copyLabel.textContent = "Copy link";
    setGenerateLabel("Generate link");
  }

  function renderPreview() {
    const name = usernameInput.value.trim();
    previewName.textContent = name || "your name";
    previewName.classList.toggle("is-placeholder", !name);

    const countries = tagFields.get("countries")?.selectedOptions() ?? [];
    const genres = tagFields.get("categories")?.selectedOptions() ?? [];

    previewCountries.replaceChildren();
    if (countries.length) {
      countries.forEach((country) => {
        const chip = document.createElement("span");
        chip.className = "preview-chip";
        chip.textContent = country.label;
        previewCountries.append(chip);
      });
    } else {
      const empty = document.createElement("span");
      empty.className = "preview-empty";
      empty.textContent = "No regions yet";
      previewCountries.append(empty);
    }
    previewCountryCount.textContent = String(countries.length).padStart(2, "0");

    previewGenres.replaceChildren();
    if (genres.length) {
      genres.forEach((genre, index) => {
        const rail = document.createElement("span");
        rail.className = "preview-rail";
        rail.title = genre.label;

        const number = document.createElement("i");
        number.setAttribute("aria-hidden", "true");
        number.textContent = String(index + 1).padStart(2, "0");

        const label = document.createElement("span");
        label.textContent = genre.label;

        rail.append(number, label);
        previewGenres.append(rail);
      });
    } else {
      const empty = document.createElement("span");
      empty.className = "preview-empty";
      empty.textContent = "No rails selected";
      previewGenres.append(empty);
    }
    previewGenreCount.textContent = String(genres.length).padStart(2, "0");

    const showOnHome = getShowOnHome();
    previewHome.classList.toggle("is-off", !showOnHome);
    previewHomeLabel.textContent = showOnHome
      ? "Catalogs on your Board"
      : "Discover only";
    previewTimezone.textContent = timezone;

    previewError.hidden = true;
    clearResult();
  }

  function validate() {
    clearFieldErrors();
    previewError.hidden = true;

    let firstInvalid = null;

    if (!usernameInput.value.trim()) {
      setFieldError("username", "Add a username so your line-up has a name.");
      firstInvalid = usernameInput;
    }

    const countries = tagFields.get("countries");
    if (countries && countries.values.length === 0) {
      setFieldError("countries", "Choose at least one country.");
      firstInvalid = firstInvalid || countries.toggle;
    }

    const genres = tagFields.get("categories");
    if (genres && genres.values.length === 0) {
      setFieldError("categories", "Keep at least one catalog rail.");
      firstInvalid = firstInvalid || genres.toggle;
    }

    if (firstInvalid) {
      firstInvalid.focus();
      previewError.textContent = "Check the highlighted fields above.";
      previewError.hidden = false;
      return false;
    }

    return true;
  }

  function toStremioUrl(url) {
    try {
      const parsed = new URL(url);
      return `stremio://${parsed.host}${parsed.pathname}${parsed.search}`;
    } catch {
      return url;
    }
  }

  function showResult(url) {
    manifestUrl.textContent = url;
    openStremio.setAttribute("href", toStremioUrl(url));
    copyButton.dataset.url = url;
    copyButton.classList.remove("is-copied");
    copyLabel.textContent = "Copy link";
    previewResult.hidden = false;
    previewError.hidden = true;
    setGenerateLabel("Generate another link");

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    previewResult.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.append(textarea);
    textarea.select();

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    textarea.remove();
    return copied;
  }

  async function copyLink() {
    const url = copyButton.dataset.url;
    if (!url) return;

    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        copied = true;
      } else {
        copied = fallbackCopy(url);
      }
    } catch {
      copied = fallbackCopy(url);
    }

    if (!copied) {
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(manifestUrl);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      previewError.textContent =
        "Copy failed. The link is selected — press Ctrl/Cmd+C.";
      previewError.hidden = false;
      return;
    }

    previewError.hidden = true;
    copyButton.classList.add("is-copied");
    copyLabel.textContent = "Copied";
    window.setTimeout(() => {
      copyButton.classList.remove("is-copied");
      copyLabel.textContent = "Copy link";
    }, 2200);
  }

  async function generateLink() {
    if (!validate()) return;

    const countries = tagFields.get("countries")?.values ?? [];
    const categories = tagFields.get("categories")?.values ?? [];
    const showOnHome = getShowOnHome();

    generateButton.disabled = true;
    generateButton.classList.add("is-loading");
    setGenerateLabel("Generating link…");
    previewError.hidden = true;

    try {
      const response = await fetch(form.getAttribute("action") || "/configure", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          username: usernameInput.value.trim(),
          countries,
          categories,
          timezone,
          showOnHome,
        }),
      });

      const data = await response.json().catch(() => null);
      if (
        !response.ok ||
        !data ||
        data.success !== true ||
        typeof data.manifest !== "string"
      ) {
        throw new Error(
          response.status === 400
            ? "Check your selections and try again."
            : "Could not generate your link. Try again.",
        );
      }

      showResult(data.manifest);
    } catch (error) {
      previewError.textContent =
        error instanceof Error
          ? error.message
          : "Could not generate your link. Try again.";
      previewError.hidden = false;
      setGenerateLabel("Generate link");
    } finally {
      generateButton.disabled = false;
      generateButton.classList.remove("is-loading");
    }
  }

  usernameInput.addEventListener("input", () => {
    clearFieldError("username");
    renderPreview();
  });

  homeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      updateChoiceCards();
      renderPreview();
    });
  });

  form.addEventListener("tagchange", (event) => {
    clearFieldError(event.detail.name);
    renderPreview();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    generateLink();
  });

  generateButton.addEventListener("click", generateLink);
  copyButton.addEventListener("click", copyLink);

  document.addEventListener("click", (event) => {
    TagField.instances.forEach((field) => {
      if (!field.root.contains(event.target)) field.close();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const openField = TagField.instances.find((field) => field.isOpen());
    if (!openField) return;
    openField.close();
    openField.toggle.focus();
  });

  updateChoiceCards();
  renderPreview();
})();
