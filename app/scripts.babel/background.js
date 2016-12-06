const MESSAGE_AUTO_LOOKUP = "AUTO_LOOKUP";

chrome.runtime.onInstalled.addListener(details => {
  console.log("previousVersion", details.previousVersion);
});

chrome.runtime.onMessage.addListener(
  function (response, sender, sendResponse) {
    if (response && response.type === MESSAGE_AUTO_LOOKUP) {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { type: MESSAGE_AUTO_LOOKUP, data: response.data });
      });
    }
  });


