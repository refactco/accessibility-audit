// Harbor Market: the scripts of the correct base site. Each widget is keyboard operable.
(function () {
  "use strict";

  // Status messages go into a polite live region.
  function announce(text) {
    var region = document.getElementById("status");
    if (!region) { return; }
    region.textContent = "";
    window.setTimeout(function () { region.textContent = text; }, 50);
  }

  // Disclosure: a button with aria-expanded that shows and hides a panel.
  document.querySelectorAll(".disclosure > button").forEach(function (button) {
    var panel = document.getElementById(button.getAttribute("aria-controls"));
    button.addEventListener("click", function () {
      var open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", open ? "false" : "true");
      panel.hidden = open;
    });
  });

  // Tabs: arrow keys move between the tabs, the panel follows.
  document.querySelectorAll('[role="tablist"]').forEach(function (list) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    function select(tab) {
      tabs.forEach(function (t) {
        var selected = t === tab;
        t.setAttribute("aria-selected", selected ? "true" : "false");
        t.tabIndex = selected ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !selected;
      });
      tab.focus();
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { select(tab); });
      tab.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") { select(tabs[(i + 1) % tabs.length]); }
        if (e.key === "ArrowLeft") { select(tabs[(i - 1 + tabs.length) % tabs.length]); }
      });
    });
  });

  // Tooltip: shows on hover and on focus, stays while the pointer is on it, and Esc hides it.
  document.querySelectorAll(".tip-wrap").forEach(function (wrap) {
    var trigger = wrap.querySelector("[aria-describedby]");
    var tip = document.getElementById(trigger.getAttribute("aria-describedby"));
    function show() { tip.hidden = false; }
    function hide() { tip.hidden = true; }
    trigger.addEventListener("mouseenter", show);
    trigger.addEventListener("focus", show);
    trigger.addEventListener("blur", hide);
    wrap.addEventListener("mouseleave", hide);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { hide(); } });
  });

  // Dialog: a modal that Esc and the Close button close. The browser keeps the focus inside it.
  var openMap = document.getElementById("open-map");
  var mapDialog = document.getElementById("map-dialog");
  var closeMap = document.getElementById("close-map");
  if (openMap && mapDialog) {
    openMap.addEventListener("click", function () { mapDialog.showModal(); });
    if (closeMap) { closeMap.addEventListener("click", function () { mapDialog.close(); }); }
  }

  // Cart: "Add to cart" buttons give a status message.
  document.querySelectorAll("[data-add-to-cart]").forEach(function (button) {
    button.addEventListener("click", function () {
      announce(button.getAttribute("data-add-to-cart") + " was added to the cart.");
    });
  });

  // Favorite: icon buttons with a pressed state.
  document.querySelectorAll("[aria-pressed]").forEach(function (button) {
    button.addEventListener("click", function () {
      var pressed = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", pressed ? "false" : "true");
    });
  });

  // Sortable list: drag with the pointer, or use the Move up and Move down buttons.
  document.querySelectorAll(".sortable").forEach(function (list) {
    var dragged = null;
    list.querySelectorAll("li").forEach(function (item) {
      item.addEventListener("dragstart", function () { dragged = item; });
      item.addEventListener("dragover", function (e) { e.preventDefault(); });
      item.addEventListener("drop", function (e) {
        e.preventDefault();
        if (dragged && dragged !== item) { list.insertBefore(dragged, item); }
      });
    });
    list.addEventListener("click", function (e) {
      var button = e.target.closest("button[data-move]");
      if (!button) { return; }
      var item = button.closest("li");
      var name = item.querySelector("span").textContent;
      if (button.getAttribute("data-move") === "up" && item.previousElementSibling) {
        list.insertBefore(item, item.previousElementSibling);
        announce(name + " moved up.");
      }
      if (button.getAttribute("data-move") === "down" && item.nextElementSibling) {
        list.insertBefore(item.nextElementSibling, item);
        announce(name + " moved down.");
      }
      button.focus();
    });
  });

  // Filters: the Apply button sorts the product list. A change of the select does nothing by itself.
  var apply = document.getElementById("apply-sort");
  if (apply) {
    apply.addEventListener("click", function () {
      var select = document.getElementById("sort");
      var list = document.getElementById("product-list");
      var cards = Array.prototype.slice.call(list.children);
      cards.sort(function (a, b) {
        var pa = Number(a.getAttribute("data-price")), pb = Number(b.getAttribute("data-price"));
        return select.value === "price-desc" ? pb - pa : pa - pb;
      });
      cards.forEach(function (c) { list.appendChild(c); });
      announce("Products sorted by " + select.options[select.selectedIndex].text + ".");
    });
  }

  // Forms: validation with an error summary, an error for each field, and the focus on the summary.
  function validate(form) {
    var errors = [];
    form.querySelectorAll("[required]").forEach(function (field) {
      var error = document.getElementById(field.id + "-error");
      var label = form.querySelector('label[for="' + field.id + '"]');
      var name = label ? label.textContent.replace("*", "").trim() : field.name;
      var message = "";
      if (!field.value.trim()) {
        message = "Enter " + name.toLowerCase() + ".";
      } else if (field.type === "email" && field.value.indexOf("@") === -1) {
        message = "Enter " + name.toLowerCase() + " in the format name@example.com.";
      } else if (field.getAttribute("data-format") === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(field.value)) {
        message = "Enter " + name.toLowerCase() + " as a date in the format 2026-10-13.";
      }
      if (error) { error.textContent = message; }
      field.setAttribute("aria-invalid", message ? "true" : "false");
      if (message) { errors.push({ field: field, message: message }); }
    });
    var summary = form.querySelector(".error-summary");
    if (summary) {
      summary.innerHTML = "";
      if (errors.length) {
        var heading = document.createElement("h2");
        heading.textContent = "There is a problem";
        var ul = document.createElement("ul");
        errors.forEach(function (err) {
          var li = document.createElement("li");
          var a = document.createElement("a");
          a.href = "#" + err.field.id;
          a.textContent = err.message;
          li.appendChild(a);
          ul.appendChild(li);
        });
        summary.appendChild(heading);
        summary.appendChild(ul);
        summary.hidden = false;
        summary.focus();
      } else {
        summary.hidden = true;
      }
    }
    return errors.length === 0;
  }

  document.querySelectorAll("form[data-validate]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!validate(form)) { return; }
      var next = form.getAttribute("data-next");
      if (form.id === "order-form") {
        var data = {};
        form.querySelectorAll("input").forEach(function (i) { data[i.name] = i.value; });
        window.sessionStorage.setItem("order", JSON.stringify(data));
      }
      if (next) {
        window.location.href = next;
      } else {
        var done = form.querySelector(".done");
        if (done) { done.hidden = false; done.focus(); }
        form.querySelector("button[type=submit]").disabled = true;
      }
    });
  });

  // Order review: shows the data of step 1, so that the user does not type it again.
  var review = document.getElementById("order-review");
  if (review) {
    var saved = JSON.parse(window.sessionStorage.getItem("order") || "{}");
    review.querySelectorAll("[data-field]").forEach(function (cell) {
      cell.textContent = saved[cell.getAttribute("data-field")] || "(empty)";
    });
    var email = document.getElementById("confirm-email");
    if (email) { email.value = saved.email || ""; }
  }
})();
