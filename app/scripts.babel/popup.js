const optionList = ["filter"];
const MESSAGE_AUTO_LOOKUP = "AUTO_LOOKUP";

let currentUrl = null; // 当前tab的url
let currentOptions = {};   // storage中现有的option
let windowId = null;

main();

function main() {
  restoreOption();
  $("#form").on("submit", function (e) {
    e.preventDefault();
  });
  $("#lookup").on("click", function () {
    const word = $("#word").val();
    lookup(word);
  });
  $(document.body).on("keydown", function (e) {
    // enter键查询
    if (e.which === 13) {
      const word = $("#word").val();
      lookup(word);
    }
  });
  $("#form-option").on("change", function () {
    const formData = getFormObj(this);
    console.log(formData);
    sendMessage({
      type: MESSAGE_AUTO_LOOKUP,
      data: Boolean(formData.filter)
    });
    storeOption(formData, currentOptions, currentUrl);
  });
}

function sendMessage(message) {
  chrome.runtime.sendMessage(message, function (response) {
    console.log("response is: ", response);
  });
}

function getFormObj(form) {
  const serializeArray = $(form).serializeArray();
  return serializeArray.reduce((ret, item) => {
    ret[item.name] = item.value;
    return ret;
  }, {});
}

function storeOption(formData, oldOption, currentUrl) {
  let nextFilter = [];
  const filter = oldOption.filter;
  const index = filter.indexOf(currentUrl);
  if (formData.filter && index === -1) {
    nextFilter = filter.concat([currentUrl]);
  } else if (!formData.filter && index !== -1) {
    nextFilter = filter.slice(0, index).concat(filter.slice(index + 1));
  }
  // update current option
  currentOptions.filter = nextFilter;
  chrome.storage.sync.set({ filter: nextFilter});
}

function restoreOption() {
  chrome.windows.getCurrent({ populate: true, windowTypes: ["normal"] }, function (sWin) {
    if (sWin) {
      windowId = sWin.id;
      getCurrentTabUrl(sWin.id).then(url => {
        currentUrl = url;
        chrome.storage.sync.get(["filter", "lastWord"], function (items) {
          currentOptions = items;
          // restore filter option
          const filter = currentOptions.filter || [];
          if (filter.indexOf(currentUrl) !== -1) {
            $("[name=filter]").attr("checked", true);
          }
          if (currentOptions.lastWord) {
            $("#word").val(currentOptions.lastWord);
          }
        });
      });
    }
  });
}

function getCurrentTabUrl(windowId) {
  return new Promise(function (resolve, reject) {
    chrome.tabs.query({ active: true, windowId }, function(tab) {
      if (tab && tab.length === 1) {
        resolve(tab[0].url);
      } else {
        reject(null);
      }
    });
  });
}

function isEmpty(object) {
  return object === undefined || object === null || object === "";
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
      renderResult(translated);
    })
    .catch(_ => {
      renderResult("<h4>暂未找到释义</h4>");
    });
}

function translateXML(xmlNode) {
  const root = xmlNode.getElementsByTagName("yodaodict")[0];
  const translationList = root.getElementsByTagName("translation");
  const webTranslationList = root.getElementsByTagName("web-translation");
  const title = "英汉释义", webTitle = "网络释义";
  const emptyTemplate = "<h5>暂未找到相关释义<h5>";
  let ret = [], template = "";
  for(let i = 0, len = translationList.length; i < len; i++) {
    const translation = translationList[i];
    const interpretation = translation.getElementsByTagName("content")[0].childNodes[0].nodeValue;
    ret.push(interpretation);
  }
  const baseTrans = ret.join("<br/>");
  const webTrans = translateWebInterpretation(webTranslationList);
  const baseEmpty = isEmpty(baseTrans);
  const webEmpty = isEmpty(webTrans);
  if (baseEmpty && webEmpty) {
    template = emptyTemplate;
  } else if (baseEmpty) {
    template = `
      <h5 class="category-title">${title}:</h5>
      <div class="interpretation"> ${emptyTemplate}</div>
      <h5 class="category-title">${webTitle}:</h5>
      <div class="interpretation">${webTrans}</div>
    `
  } else if (webEmpty) {
    template = `
      <h5 class="category-title">${title}:</h5>
      <div class="interpretation">${baseTrans}</div>
      <h5 class="category-title">${webTitle}:</h5>
      <div class="interpretation"> ${emptyTemplate}</div>
    `;
  } else {
    template = `
    <h5 class="category-title">英汉释义</h5>
    <div class="interpretation">${baseTrans}</div>
    <h5 class="category-title">网络释义<h5>
    <div class="interpretation">${webTrans}</div>
  `;
  }
  return template;
}

// 网络释义的解析
function translateWebInterpretation(nodeList) {
  let ret = [];
  for(let i = 0, len = nodeList.length; i < len; i++) {
    const node = nodeList[i];
    const key = node.getElementsByTagName("key")[0].childNodes[0].nodeValue;
    let trans = [];
    const transList = node.getElementsByTagName("trans");
    for(let j = 0, l = transList.length; j < l; j++) {
      const transNode = transList[j];
      const value = transNode.getElementsByTagName("value")[0].childNodes[0].nodeValue;
      trans.push(value);
    }
    const translation = trans.join(";");
    ret.push(`${key}: ${translation}`);
  }
  return ret.join("<br/>");
}

function renderResult(innerHtml) {
  $("#result").html(innerHtml);
}

function getUrl(word) {
  return `http://dict.youdao.com/fsearch?client=deskdict&keyfrom=chrome.extension&q=${encodeURIComponent(word)}&pos=-1&doctype=xml&xmlVersion=3.2&dogVersion=1.0&vendor=unknown&appVer=3.1.17.4208&le=eng`
}

