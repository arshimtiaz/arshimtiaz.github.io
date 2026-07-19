(function () {
  "use strict";

  var links = Array.prototype.slice.call(document.querySelectorAll('a[href*="/glossary/#"]'));
  if (!links.length || window.location.pathname.indexOf("/glossary/") === 0) return;

  var glossaryCache = {};
  var popup = null;
  var activeLink = null;
  var hideTimer = null;
  var showTimer = null;

  function makePopup() {
    var element = document.createElement("aside");
    element.className = "glossary-popup";
    element.setAttribute("role", "dialog");
    element.setAttribute("aria-label", "Glossary definition");
    element.innerHTML =
      '<button class="glossary-popup__close" type="button" aria-label="Close definition">&times;</button>' +
      '<h3 class="glossary-popup__title"></h3>' +
      '<p class="glossary-popup__definition"></p>' +
      '<p class="glossary-popup__security-view"></p>' +
      '<a class="glossary-popup__link" target="_self">Open in glossary &rarr;</a>';
    document.body.appendChild(element);
    element.querySelector(".glossary-popup__close").addEventListener("click", closePopup);
    element.addEventListener("mouseenter", function () {
      window.clearTimeout(hideTimer);
    });
    element.addEventListener("mouseleave", scheduleClose);
    return element;
  }

  function termId(link) {
    return decodeURIComponent(new URL(link.href, window.location.href).hash.slice(1));
  }

  function loadTerm(link) {
    var url = new URL(link.href, window.location.href);
    var id = termId(link);
    if (glossaryCache[id]) return glossaryCache[id];

    glossaryCache[id] = fetch(url.origin + url.pathname)
      .then(function (response) {
        if (!response.ok) throw new Error("Glossary could not be loaded");
        return response.text();
      })
      .then(function (html) {
        var page = new DOMParser().parseFromString(html, "text/html");
        var heading = page.getElementById(id);
        if (!heading) throw new Error("Glossary term not found");

        var paragraphs = [];
        var sibling = heading.nextElementSibling;
        while (sibling && !/^H[1-3]$/i.test(sibling.tagName)) {
          if (sibling.tagName === "P" && sibling.textContent.trim()) paragraphs.push(sibling.textContent.trim());
          sibling = sibling.nextElementSibling;
        }

        return {
          title: heading.textContent.trim(),
          definition: paragraphs[0] || "See the full glossary entry for this term.",
          securityView: paragraphs[1] || "",
          url: url.href
        };
      });

    return glossaryCache[id];
  }

  function positionPopup(link) {
    var rectangle = link.getBoundingClientRect();
    var margin = 16;
    var width = popup.offsetWidth;
    var left = Math.max(margin, Math.min(rectangle.left, window.innerWidth - width - margin));
    // Prefer showing the definition above the linked term.
    var top = rectangle.top - popup.offsetHeight - 12;
    // Fall back below only when the term is too close to the top edge.
    if (top < margin) top = rectangle.bottom + 12;
    popup.style.left = left + "px";
    popup.style.top = Math.min(top, window.innerHeight - popup.offsetHeight - margin) + "px";
  }

  function showPopup(link) {
    window.clearTimeout(hideTimer);
    activeLink = link;
    if (!popup) popup = makePopup();
    links.forEach(function (item) { item.setAttribute("aria-expanded", item === link ? "true" : "false"); });
    popup.classList.add("is-visible");
    popup.querySelector(".glossary-popup__title").textContent = "Loading definition…";
    popup.querySelector(".glossary-popup__definition").textContent = "";
    popup.querySelector(".glossary-popup__security-view").textContent = "";
    positionPopup(link);

    loadTerm(link).then(function (term) {
      if (activeLink !== link) return;
      popup.querySelector(".glossary-popup__title").textContent = term.title;
      popup.querySelector(".glossary-popup__definition").textContent = term.definition;
      popup.querySelector(".glossary-popup__security-view").textContent = term.securityView;
      popup.querySelector(".glossary-popup__security-view").hidden = !term.securityView;
      popup.querySelector(".glossary-popup__link").href = term.url;
      positionPopup(link);
    }).catch(function () {
      if (activeLink !== link) return;
      popup.querySelector(".glossary-popup__title").textContent = "Glossary term";
      popup.querySelector(".glossary-popup__definition").textContent = "Open the full glossary entry for the definition.";
      popup.querySelector(".glossary-popup__security-view").hidden = true;
      popup.querySelector(".glossary-popup__link").href = link.href;
    });
  }

  function scheduleClose() {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(closePopup, 180);
  }

  function closePopup() {
    window.clearTimeout(showTimer);
    activeLink = null;
    links.forEach(function (link) { link.setAttribute("aria-expanded", "false"); });
    if (popup) popup.classList.remove("is-visible");
  }

  links.forEach(function (link) {
    link.classList.add("glossary-term-link");
    link.setAttribute("aria-expanded", "false");
    link.addEventListener("mouseenter", function () {
      window.clearTimeout(showTimer);
      showTimer = window.setTimeout(function () { showPopup(link); }, 120);
    });
    link.addEventListener("mouseleave", scheduleClose);
    link.addEventListener("focus", function () { showPopup(link); });
    link.addEventListener("blur", scheduleClose);
    link.addEventListener("click", function (event) {
      if (activeLink === link && popup && popup.classList.contains("is-visible")) return;
      event.preventDefault();
      showPopup(link);
    });
  });

  document.addEventListener("click", function (event) {
    if (activeLink && event.target !== activeLink && (!popup || !popup.contains(event.target))) closePopup();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closePopup();
  });
  window.addEventListener("resize", function () { if (activeLink && popup) positionPopup(activeLink); });
  window.addEventListener("scroll", function () { if (activeLink && popup) positionPopup(activeLink); }, true);
})();
