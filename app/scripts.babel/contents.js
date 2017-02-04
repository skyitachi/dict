const MESSAGE_AUTO_LOOKUP = "AUTO_LOOKUP";
const TRANSLATE_WORD = "translate_word";
const POPUP_CONTENT_ID = "youdao-popup-content";
const POPUP_CLOSE_ID = "youdao-popup-close";
const POPUP = "youdao-popup";
const VOICE_IMG = "youdao-voice-img";
const POPUP_HEADER = "youdao-popup-header";
const POPUP_TITLE = "youdao-popup-title";
const WIDTH = 300; // popup content width

let selectionStart = false;
let enableAutoTranslate = false; // 是否启用划词翻译
let currentWord = "";
const audioContext = new AudioContext();
main();

function main() {
  chrome.storage.sync.get(["filter"], function (items) {
    renderContentWrapper();
    if (items.filter && items.filter.indexOf(window.location.href) !== -1) {
      enableAutoTranslate = true;
    }
    document.body.addEventListener("mousedown", function () {
      selectionStart = true;
    });
    document.body.addEventListener("mouseup", function (event) {
      // click on close button will enable mouseup event
      const closeElement = document.getElementById(POPUP_CLOSE_ID);
      if (event.target === closeElement) return;
      if (selectionStart) {
        const selection = window.getSelection();
        const word = selection.toString().trim();
        if (isSentence(word)) return;
        currentWord = word;
        chrome.storage.sync.set({"lastWord": word});
        if (enableAutoTranslate && word) {
          findPosition(selection, word);
          lookup(word);
        } else {
          document.getElementById(POPUP).style.display = "none";
        }
      }
      selectionStart = false;
    });
    document.body.addEventListener("keyup", function (event) {
      // ctrl+shift+e, enable auto lookup
      if (event.key === "E" && event.ctrlKey && event.shiftKey) {
        enableAutoTranslate = true;
        sendMessage({ type: MESSAGE_AUTO_LOOKUP, data: true });
        // store filter
        chrome.storage.sync.get(["filter"], function (items) {
          const url = location.href;
          const currentFilter = items.filter || [];
          if (currentFilter.indexOf(url) === -1) {
            chrome.storage.sync.set({ filter: currentFilter.concat([url])});
          }
        });
      }
      // ctrl+shift+u, disable auto lookup
      if (event.key === "U" && event.ctrlKey && event.shiftKey) {
        enableAutoTranslate = false;
        // remove filter
        chrome.storage.sync.get(["filter"], function (items) {
          const url = location.href;
          const currentFilter = items.filter || [];
          const idx = currentFilter.indexOf(url);
          if (idx !== -1) {
            chrome.storage.sync.set({ filter: currentFilter.slice(0, idx).concat(currentFilter.slice(idx + 1))});
          }
        });
      }
    });
  });
  chrome.runtime.onMessage.addListener(function (response, sender, sendResponse) {
    if (response && response.type === MESSAGE_AUTO_LOOKUP) {
      enableAutoTranslate = response.data || false;
    }
  });
}

function sendMessage(message) {
  chrome.runtime.sendMessage(message, function (response) {
    // console.log("response is: ", response);
  });
}

function translateXML(xmlNode) {
  const root = xmlNode.getElementsByTagName("yodaodict")[0];
  const translationList = root.getElementsByTagName("translation");
  const webTranslationList = root.getElementsByTagName("web-translation");
  const emptyTemplate = "<h5>暂未找到相关释义<h5>";
  const res = {
    baseTitle: "英汉释义",
    webTitle: "网络释义",
    emptyTemplate: emptyTemplate
  };
  const baseTrans = translateBaseInterpretation(translationList);
  const webTrans = translateWebInterpretation(webTranslationList);
  const baseEmpty = isEmpty(baseTrans);
  const webEmpty = isEmpty(webTrans);
  if (baseEmpty && webEmpty) {
    res.isEmpty = true;
  } else if (baseEmpty) {
    res.baseTemplate = emptyTemplate;
  } else if (webEmpty) {
    res.webTemplate = emptyTemplate;
  } else {
    res.baseTemplate = baseTrans;
    res.webTemplate = webTrans;
  }
  return contentTpl(res);
}

// 基本释义的解析
function translateBaseInterpretation(translationList) {
  const ret = [];
  for (let i = 0, len = translationList.length; i < len; i++) {
    const translation = translationList[i];
    const interpretation = translation.getElementsByTagName("content")[0].childNodes[0].nodeValue;
    ret.push(interpretation);
  }
  return ret.join("<br/>");
}

// 网络释义的解析
function translateWebInterpretation(nodeList) {
  let ret = [];
  for (let i = 0, len = nodeList.length; i < len; i++) {
    const node = nodeList[i];
    const key = node.getElementsByTagName("key")[0].childNodes[0].nodeValue;
    let trans = [];
    const transList = node.getElementsByTagName("trans");
    for (let j = 0, l = transList.length; j < l; j++) {
      const transNode = transList[j];
      const value = transNode.getElementsByTagName("value")[0].childNodes[0].nodeValue;
      trans.push(value);
    }
    const translation = trans.join(";");
    ret.push(`${key}: ${translation}`);
  }
  return ret.join("<br/>");
}


function lookup(word) {
  if (!word) return;
  const url = getUrl(word);
  fetch(url)
  .then(res => {
    if (res.status === 200) {
      return res.text();
    } else {
      return Promise.reject(new Error(res.status))
    }
  })
  .then(body => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(body, "application/xml");
    const translated = translateXML(doc);
    renderPopup(translated, word);
  })
  .catch(e => {
    console.log(e.message, e.stack);
    renderPopup("<h4>暂未找到释义</h4>");
  });
}

function getUrl(word) {
  const protocol = window.location.protocol;
  return `${protocol}//dict.youdao.com/fsearch?client=deskdict&keyfrom=chrome.extension&q=${encodeURIComponent(word)}&pos=-1&doctype=xml&xmlVersion=3.2&dogVersion=1.0&vendor=unknown&appVer=3.1.17.4208&le=eng`
}

function getAudioUrl(word) {
  const protocol = window.location.protocol;
  // US
  return `${protocol}//dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`;
}

function renderPopup(template, word) {
  const container = document.getElementById(POPUP);
  const content = document.getElementById(POPUP_CONTENT_ID);
  const title = document.getElementById(POPUP_TITLE);
  if (container && content) {
    container.style.display = "block";
    content.innerHTML = template;
  }
  if (title) {
    title.innerText = word;
  }
}

function isEmpty(object) {
  return object === undefined || object === null || object === "";
}

function renderContentWrapper() {
  const pngSrc = chrome.extension.getURL("images/megaphone.png");
  const template = `
    <div id="${POPUP_HEADER}">
      <span id="${POPUP_TITLE}"></span>
      <img src="${pngSrc}" id="${VOICE_IMG}" />
      <span id="${POPUP_CLOSE_ID}">X</span>
    </div>
    <div id="${POPUP_CONTENT_ID}"></div>
  `;
  const container = document.createElement("div");
  container.id = POPUP;
  container.className = POPUP;
  container.innerHTML = template;
  container.draggable = true;
  // set drag event
  setupDragEvent(container);
  document.body.appendChild(container);
  const closeElement = document.getElementById(POPUP_CLOSE_ID);
  const voiceElement = document.getElementById(VOICE_IMG);
  if (closeElement && container) {
    closeElement.addEventListener("click", function () {
      container.style.display = "none";
    });
  }

  if (voiceElement) {
    voiceElement.addEventListener("click", function () {
      const url = getAudioUrl(currentWord);
      fetch(url)
      .then(res => {
        return res.arrayBuffer();
      })
      .then(arrBuf => {
        return audioContext.decodeAudioData(arrBuf);
      })
      .then(audioBuf => {
        const source = audioContext.createBufferSource();
        source.buffer = audioBuf;
        source.connect(audioContext.destination);
        source.start(0);
      })
      .catch(error => {
        console.log(error);
      });
    });
  }
}

function get_text_width(txt, font) {
  const element = document.createElement("canvas");
  const context = element.getContext("2d");
  context.font = font;
  return context.measureText(txt).width;
}

// consider body scroll
function findPosition(selection, word = "") {
  const rangeRect = selection.getRangeAt(0).getBoundingClientRect();
  const anchorNode = selection.anchorNode;
  const parentElement = anchorNode.parentElement;
  const scrollTop = document.body.scrollTop;
  const scrollLeft = document.body.scrollLeft;
  const computedStyle = window.getComputedStyle(parentElement);
  const container = document.getElementById(POPUP);
  const txtWidth = get_text_width("a", computedStyle.font);
  container.style.top = `${scrollTop + rangeRect.top + rangeRect.height}px`;
  // left 仍然以屏幕为基准取位置
  let left = scrollLeft + rangeRect.left + word.length * txtWidth;
  if (left + WIDTH + 10 > document.body.offsetWidth) {
    left = document.body.offsetWidth - 10 - WIDTH;
  }
  container.style.left = `${left}px`;
}

function contentTpl(res/* look up result */) {
  if (res.isEmpty) {
    return res.emptyTemplate;
  }
  return `
    <h5 class="category-title">${res.baseTitle}:</h5>
    <div class="interpretation">${res.baseTemplate}</div>
    <h5 class="category-title">${res.webTitle}:</h5>
    <div class="interpretation">${res.webTemplate}</div>
  `;
}

function isBasicLatin(word = "") {
  const re = /[^\u0000-\u007f]/;
  return !re.test(word);
}

// 英文句子暂时不自动翻译
function isNormalEnglishWord(words) {
  const list = words.split(/\s+/);
  if (list.length > 2)  return false;
  return list.every(isBasicLatin);
}

// 句子暂时不翻译
function isSentence(words = "") {
  return words.split(/\s+/).length >= 4;
}

function setupDragEvent(element) {
  element.addEventListener("dragend", function (event) {
    const target = event.target;
    const height = target.offsetHeight;
    const scrollTop = document.body.scrollTop;
    element.style.left = `${Math.max(event.clientX, 0)}px`;
    element.style.top = `${Math.max(event.clientY - height + scrollTop, 0)}px`;
  });
}
