(function () {
  "use strict";

  var counter = document.querySelector("[data-view-counter]");
  if (!counter) return;

  var endpoint = counter.getAttribute("data-view-endpoint");
  var path = counter.getAttribute("data-view-path") || window.location.pathname;
  if (!endpoint) return;

  var key = path.replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9]+/g, "-") || "home";
  var count = counter.querySelector("[data-view-count]");
  var url = endpoint.replace(/\/$/, "") + "/" + encodeURIComponent(key) + "/up";

  fetch(url, { headers: { Accept: "application/json" } })
    .then(function (response) {
      if (!response.ok) throw new Error("view counter request failed");
      return response.json();
    })
    .then(function (data) {
      if (count && Number.isFinite(data.count)) count.textContent = data.count.toLocaleString();
    })
    .catch(function () {
      if (count) count.textContent = "—";
    });
})();
