
(() => {
  "use strict";

  // Existing GDPD API — retain until a new GNN endpoint is deployed.
  const NEWS_API =
    "https://gnn-news-engine.advaitchithira.workers.dev/news";

  const CACHE_KEY = "gnn-news-cache-v1";
  const CACHE_TTL = 10 * 60 * 1000;
  const MAX_DISPLAY = 60;

  const $ = id => document.getElementById(id);

  const state = {
    stories: [],
    category: "all",
    query: "",
    loading: false
  };

  const CATEGORY_NAMES = {
    world: "World",
    india: "India",
    kerala: "Kerala",
    business: "Business",
    technology: "Technology",
    science: "Science",
    defence: "Defence",
    security: "Security",
    policy: "Politics & Diplomacy"
  };

  function cleanText(value) {
    const doc = new DOMParser().parseFromString(
      String(value || ""),
      "text/html"
    );

    return (doc.body.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);

      return ["https:", "http:"].includes(url.protocol)
        ? url.href
        : "";
    } catch {
      return "";
    }
  }

  function classify(story) {
    const text =
      `${story.title} ${story.description} ${story.source}`
        .toLowerCase();

    if (/\b(kerala|kochi|thiruvananthapuram|kottayam|malayalam)\b/.test(text)) {
      return "kerala";
    }

    if (/\b(india|indian|new delhi|modi|lok sabha|rajya sabha|bharat)\b/.test(text)) {
      return "india";
    }

    if (/\b(stock market|stocks|economy|economic|bank|finance|business|trade|market|rupee|inflation|company|companies)\b/.test(text)) {
      return "business";
    }

    if (/\b(ai|artificial intelligence|technology|tech|robotics|software|computer|cyber|satellite|space|innovation|smartphone)\b/.test(text)) {
      return "technology";
    }

    if (/\b(science|scientist|research|discovery|climate|environment|medical research)\b/.test(text)) {
      return "science";
    }

    if (/\b(defence|defense|military|army|navy|air force|weapon|missile|soldier|warfare)\b/.test(text)) {
      return "defence";
    }

    if (/\b(terror|intelligence|espionage|security|cyberattack|hostage)\b/.test(text)) {
      return "security";
    }

    if (/\b(diplomacy|summit|treaty|sanction|foreign minister|negotiation|nato|united nations|peace talks|parliament|election|president|government|minister)\b/.test(text)) {
      return "policy";
    }

    return "world";
  }

  function normalizeStory(item) {
    const title = cleanText(item.title);
    const link = safeUrl(item.link || item.url || item.guid);

    if (!title || !link) return null;

    const rawDate =
      item.pubDate || item.published || item.updated || "";

    return {
      title,
      link,
      description: cleanText(
        item.description || item.content || item.summary || ""
      ).slice(0, 700),

      pubDate:
        rawDate && !Number.isNaN(Date.parse(rawDate))
          ? new Date(rawDate).toISOString()
          : "",

      source: cleanText(item.source || "News source"),
      category: ""
    };
  }

  function uniqueStories(items) {
    const seen = new Set();

    return items
      .map(normalizeStory)
      .filter(Boolean)
      .filter(story => {
        const key = story.link
          .replace(/[?#].*$/, "")
          .replace(/\/+$/, "")
          .toLowerCase();

        if (seen.has(key)) return false;

        seen.add(key);
        story.category = classify(story);

        return true;
      })
      .sort((a, b) =>
        (Date.parse(b.pubDate) || 0) -
        (Date.parse(a.pubDate) || 0)
      );
  }

  function readCache() {
    try {
      const cache = JSON.parse(
        localStorage.getItem(CACHE_KEY) || "null"
      );

      return cache && Array.isArray(cache.items)
        ? cache
        : null;
    } catch {
      return null;
    }
  }

  function saveCache(items) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          items
        })
      );
    } catch (error) {
      console.warn("GNN: cache unavailable", error);
    }
  }

  function setStatus(message, timestamp = null) {
    $("statusText").textContent = message;

    $("lastUpdated").textContent = timestamp
      ? "Updated " +
        new Date(timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        })
      : "";
  }

  function formatDate(value) {
    if (!value) return "Date unavailable";

    return new Date(value).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  function createStoryCard(story, index = 0) {
    const card = document.createElement("article");
    card.className = "news-card";
    card.style.animationDelay =
      `${Math.min(index * 25, 250)}ms`;

    const meta = document.createElement("div");
    meta.className = "card-meta";

    const category = document.createElement("span");
    category.className = "card-category";
    category.textContent =
      CATEGORY_NAMES[story.category] || "World";

    const date = document.createElement("time");
    date.className = "card-date";

    if (story.pubDate) {
      date.dateTime = story.pubDate;
    }

    date.textContent = formatDate(story.pubDate);

    meta.append(category, date);

    const heading = document.createElement("h3");
    const titleLink = document.createElement("a");

    titleLink.href = story.link;
    titleLink.target = "_blank";
    titleLink.rel = "noopener noreferrer";
    titleLink.textContent = story.title;

    heading.append(titleLink);

    const description = document.createElement("p");

    description.textContent = story.description
      ? story.description.slice(0, 180) +
        (story.description.length > 180 ? "…" : "")
      : "Open the original publisher's report for details.";

    const bottom = document.createElement("div");
    bottom.className = "card-bottom";

    const source = document.createElement("span");
    source.className = "card-source";
    source.textContent = story.source;

    const readLink = document.createElement("a");
    readLink.className = "card-link";
    readLink.href = story.link;
    readLink.target = "_blank";
    readLink.rel = "noopener noreferrer";
    readLink.textContent = "Read report ↗";

    bottom.append(source, readLink);

    card.append(meta, heading, description, bottom);

    return card;
  }

  function getFilteredStories() {
    return state.stories.filter(story => {
      const text =
        `${story.title} ${story.description} ${story.source}`
          .toLowerCase();

      const matchesQuery =
        !state.query || text.includes(state.query);

      const matchesCategory =
        state.category === "all" ||
        story.category === state.category;

      return matchesQuery && matchesCategory;
    });
  }

  function renderFeed() {
    const feed = $("newsFeed");
    const filtered = getFilteredStories();

    feed.replaceChildren();

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";

      const heading = document.createElement("strong");
      heading.textContent = state.stories.length
        ? "No matching reports"
        : "News feed unavailable";

      const detail = document.createElement("p");
      detail.textContent = state.stories.length
        ? "Try another search or clear your filters."
        : "Check the news API and try refreshing.";

      empty.append(heading, detail);
      feed.append(empty);

      $("resultCount").textContent =
        state.stories.length
          ? "0 reports match your filters"
          : "No reports available";

      return;
    }

    filtered
      .slice(0, MAX_DISPLAY)
      .forEach((story, index) => {
        feed.append(createStoryCard(story, index));
      });

    $("resultCount").textContent =
      `Showing ${Math.min(filtered.length, MAX_DISPLAY)} of ` +
      `${filtered.length} matching reports`;
  }

  function renderCategoryFeed(category, elementId) {
    const container = $(elementId);

    if (!container) return;

    const items = state.stories
      .filter(story => story.category === category)
      .slice(0, 3);

    container.replaceChildren();

    if (!items.length) {
      const message = document.createElement("p");
      message.className = "empty-state";
      message.textContent =
        `No ${CATEGORY_NAMES[category] || category} reports available yet.`;

      container.append(message);
      return;
    }

    items.forEach((story, index) => {
      container.append(createStoryCard(story, index));
    });
  }

  function renderBreakingNews() {
    const breaking = state.stories[0];

    if (breaking) {
      $("breakingText").textContent = breaking.title;
    }
  }

  function renderMostRead() {
    const container = $("mostRead");

    container.replaceChildren();

    state.stories.slice(0, 5).forEach(story => {
      const item = document.createElement("li");
      const link = document.createElement("a");

      link.href = story.link;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = story.title;

      item.append(link);
      container.append(item);
    });

    if (!state.stories.length) {
      const item = document.createElement("li");
      item.textContent = "No headlines available.";
      container.append(item);
    }
  }

  function renderAll() {
    renderFeed();
    renderBreakingNews();
    renderMostRead();

    renderCategoryFeed("world", "worldFeed");
    renderCategoryFeed("india", "indiaFeed");
    renderCategoryFeed("kerala", "keralaFeed");
    renderCategoryFeed("business", "businessFeed");
    renderCategoryFeed("technology", "technologyFeed");
  }

  async function loadNews({ force = false } = {}) {
    if (state.loading) return;

    state.loading = true;

    const refresh = $("refreshButton");
    refresh.disabled = true;
    refresh.textContent = "Updating...";

    const cache = readCache();

    if (
      !force &&
      cache?.items?.length &&
      Date.now() - cache.savedAt < CACHE_TTL
    ) {
      state.stories = uniqueStories(cache.items);

      setStatus(
        `Showing saved reports · ${state.stories.length} stories`,
        cache.savedAt
      );

      renderAll();
      finishLoading();

      return;
    }

    if (cache?.items?.length && !state.stories.length) {
      state.stories = uniqueStories(cache.items);
      renderAll();
    }

    setStatus("Connecting to GNN news desk...");

    try {
      const controller = new AbortController();

      const timeout = setTimeout(
        () => controller.abort(),
        20000
      );

      let response;

      try {
        response = await fetch(NEWS_API, {
          cache: "no-store",
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new Error(
          `News API returned HTTP ${response.status}`
        );
      }

      const data = await response.json();

      if (!Array.isArray(data.items)) {
        throw new Error("API response has no items array");
      }

      state.stories = uniqueStories(data.items);

      saveCache(state.stories);

      setStatus(
        `Loaded ${state.stories.length} stories`,
        data.updatedAt || Date.now()
      );

      if (data.unavailableSources?.length) {
        console.warn(
          "GNN: unavailable sources",
          data.unavailableSources
        );
      }
    } catch (error) {
      console.error("GNN news API error:", error);

      if (cache?.items?.length) {
        state.stories = uniqueStories(cache.items);

        setStatus(
          "Live API unavailable · showing saved reports",
          cache.savedAt
        );
      } else {
        state.stories = [];

        setStatus(
          "Unable to load news: " + error.message
        );
      }
    }

    renderAll();
    finishLoading();
  }

  function finishLoading() {
    state.loading = false;

    const refresh = $("refreshButton");

    refresh.disabled = false;
    refresh.textContent = "↻ Refresh";

    $("newsFeed").setAttribute("aria-busy", "false");
  }

  // Search
  function performSearch() {
    state.query = $("searchInput")
      .value
      .trim()
      .toLowerCase();

    renderFeed();

    $("latest").scrollIntoView({
      behavior: "smooth"
    });
  }

  $("searchButton").addEventListener(
    "click",
    performSearch
  );

  $("searchInput").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      performSearch();
    }
  });

  $("searchToggle").addEventListener("click", () => {
    $("searchPanel").classList.toggle("open");

    if ($("searchPanel").classList.contains("open")) {
      $("searchInput").focus();
    }
  });

  $("closeSearch").addEventListener("click", () => {
    $("searchPanel").classList.remove("open");
  });

  // Category filters
  $("categoryFilter").addEventListener("click", event => {
    const button = event.target.closest(".filter");

    if (!button) return;

    state.category = button.dataset.category;

    document.querySelectorAll(".filter").forEach(filter => {
      filter.classList.toggle(
        "active",
        filter.dataset.category === state.category
      );
    });

    renderFeed();
  });

  // Clear filters
  $("clearFilters").addEventListener("click", () => {
    state.category = "all";
    state.query = "";

    $("searchInput").value = "";

    document.querySelectorAll(".filter").forEach(filter => {
      filter.classList.toggle(
        "active",
        filter.dataset.category === "all"
      );
    });

    renderFeed();
  });

  // Refresh news
  $("refreshButton").addEventListener("click", () => {
    loadNews({ force: true });
  });

  // Mobile navigation
  const menuToggle = $("menuToggle");
  const mainNav = $("mainNav");

  menuToggle.addEventListener("click", () => {
    const open = mainNav.classList.toggle("open");

    menuToggle.setAttribute(
      "aria-expanded",
      String(open)
    );

    menuToggle.textContent = open ? "✕" : "☰";
  });

  mainNav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      mainNav.classList.remove("open");

      menuToggle.setAttribute(
        "aria-expanded",
        "false"
      );

      menuToggle.textContent = "☰";
    });
  });

  // Date and copyright
  $("currentDate").textContent =
    new Date().toLocaleDateString([], {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });

  $("year").textContent = new Date().getFullYear();

  // Initialize
  loadNews();

})();
