function createContentPersistence(context) {
  const utils = context.utils;

  function settings() {
    return context.state.settings;
  }

  async function saveHistory(text, result, source, isSelectionBased, metadata) {
    const entry = {
      text: text,
      snippet: utils.getTextSnippet(text),
      source: source,
      mode: "copy",
      url: window.location.href,
      hostname: window.location.hostname,
      pinned: false,
      replayCount: 0,
      lastReplayedAt: isSelectionBased ? Date.now() : 0,
    };
    if (metadata && metadata.targetKind) {
      entry.targetKind = metadata.targetKind;
    }
    if (metadata && metadata.copyFormat) {
      entry.copyFormat = metadata.copyFormat;
    }
    const failure = await saveHistoryThroughBackground(entry);
    if (failure && utils.isExtensionContextValid()) {
      console.warn("Saving copy history through the background service worker failed:", failure);
    }
  }

  // Returns "" on success, otherwise the failure reason.
  async function saveHistoryThroughBackground(entry) {
    if (!utils.isExtensionContextValid() || !chrome.runtime || typeof chrome.runtime.sendMessage !== "function") {
      return "extension-context-unavailable";
    }

    const message = {
      type: "COPY_TEXT_LOCAL_HISTORY_ADD",
      payload: {
        entry: entry,
        limit: settings().copyHistoryLimit,
      },
    };
    let lastError = null;
    // A waking or restarting service worker can drop the first message, so retry once.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await chrome.runtime.sendMessage(message);
        if (response && response.ok) {
          return "";
        }
        return (response && response.error && response.error.message) || "no-response";
      } catch (error) {
        if (utils.isExtensionContextInvalidatedError(error)) {
          return "extension-context-invalidated";
        }
        lastError = error;
      }
    }
    return (lastError && lastError.message) || String(lastError);
  }

  async function saveAnalyticsEvent(event) {
    return saveAnalyticsEvents([event]);
  }

  async function saveAnalyticsEvents(events) {
    try {
      const current = await utils.safeStorageGet("local", { copyAnalytics: utils.DEFAULT_ANALYTICS });
      let nextAnalytics = current.copyAnalytics;
      (Array.isArray(events) ? events : [events]).forEach(function (event) {
        nextAnalytics = utils.recordAnalyticsEvent(nextAnalytics, event || {});
      });
      await utils.safeStorageSet("local", { copyAnalytics: nextAnalytics });
    } catch (error) {
      if (context.handleExtensionContextError(error)) {
        return;
      }

      console.warn("Saving copy analytics failed.", error);
    }
  }

  function getAnalyticsTypeForResult(result, source, isSelectionBased) {
    if (source == "history") {
      return "historyReplayCopy";
    }

    if (isSelectionBased) {
      return "selectionCopy";
    }

    return "copy";
  }

  function getToastAnalyticsKind(result) {
    return "copied";
  }

  return {
    saveHistory,
    saveAnalyticsEvent,
    saveAnalyticsEvents,
    getAnalyticsTypeForResult,
    getToastAnalyticsKind,
  };
}

module.exports = {
  createContentPersistence,
};
