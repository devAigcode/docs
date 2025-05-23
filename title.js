// 处理标题，去除特殊字符（如Emoji）
function processTitle() {
  const originalTitle = document.title;
  // 使用Unicode属性转义匹配Emoji和符号，替换为空字符串
  const cleanTitle = originalTitle.replace(/\p{Emoji}/gu, '');
  if (cleanTitle !== originalTitle) {
    document.title = cleanTitle;
  }
}

// 监听标题变化
const titleElement = document.querySelector('title');
if (titleElement) {
  new MutationObserver(processTitle)
    .observe(titleElement, { childList: true });
}

// 处理页面导航事件
window.addEventListener('hashchange', processTitle);

// 劫持History API以监听路由变化
(function(history) {
  const { pushState, replaceState } = history;
  
  history.pushState = function(state, title, url) {
    const result = pushState.apply(history, arguments);
    window.dispatchEvent(new Event('pushstate'));
    return result;
  };
  
  history.replaceState = function(state, title, url) {
    const result = replaceState.apply(history, arguments);
    window.dispatchEvent(new Event('replacestate'));
    return result;
  };
})(window.history);

// 监听自定义的history变化事件
window.addEventListener('pushstate', processTitle);
window.addEventListener('replacestate', processTitle);

// 初始化处理
processTitle();