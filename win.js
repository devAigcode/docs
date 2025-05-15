const REPLACE_CONFIG = {
  targetString: '%26',      // 需要替换的原始字符串
  replaceTo: 'and',         // 替换后的字符串
  attributes: ['id', 'href'], // 同时监控ID和HREF属性
  hashUpdate: true          // 是否自动修正URL哈希
};

(function() {
  // 1. 通用属性替换函数
  const replaceEncodedAttribute = (element, attr) => {
    const oldValue = element.getAttribute(attr);
    if (!oldValue || !oldValue.includes(REPLACE_CONFIG.targetString)) return;

    const newValue = oldValue.replaceAll(REPLACE_CONFIG.targetString, REPLACE_CONFIG.replaceTo);

    // ID特殊处理：冲突检测和哈希修正
    if (attr === 'id') {
      if (!document.getElementById(newValue)) {
        element.setAttribute(attr, newValue);
        console.log(`ID更新: ${oldValue} → ${newValue}`);
        
        if (REPLACE_CONFIG.hashUpdate && `#${newValue}` === window.location.hash) {
          requestAnimationFrame(() => element.scrollIntoView());
        }
      }
    } 
    // HREF处理：直接替换（含锚点自动适配）
    else if (attr === 'href') {
      element.setAttribute(attr, newValue);
      console.log(`HREF更新: ${oldValue} → ${newValue}`);
    }
  };

  // 2. 优化后的MutationObserver
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      // 处理新增节点
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          REPLACE_CONFIG.attributes.forEach(attr => {
            // 检查节点自身属性
            if (node.hasAttribute(attr)) replaceEncodedAttribute(node, attr);
            // 检查子节点
            node.querySelectorAll(`[${attr}]`).forEach(el => {
              if (el.getAttribute(attr).includes(REPLACE_CONFIG.targetString)) {
                replaceEncodedAttribute(el, attr);
              }
            });
          });
        }
      });

      // 处理属性变更
      if (mutation.type === 'attributes' && REPLACE_CONFIG.attributes.includes(mutation.attributeName)) {
        replaceEncodedAttribute(mutation.target, mutation.attributeName);
      }
    });
  });

  // 3. 启动监听
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributeFilter: REPLACE_CONFIG.attributes
  });

  // 4. 初始化扫描
  REPLACE_CONFIG.attributes.forEach(attr => {
    document.querySelectorAll(`[${attr}*="${REPLACE_CONFIG.targetString}"]`).forEach(el => {
      replaceEncodedAttribute(el, attr);
    });
  });

  // 5. SPA路由监听（优化版）
  let lastPath = location.pathname + location.hash;
  const checkUrlChange = () => {
    if (lastPath !== (location.pathname + location.hash)) {
      lastPath = location.pathname + location.hash;
      REPLACE_CONFIG.attributes.forEach(attr => {
        document.querySelectorAll(`[${attr}*="${REPLACE_CONFIG.targetString}"]`).forEach(el => {
          replaceEncodedAttribute(el, attr);
        });
      });
      handleHashUpdate();
    }
    requestAnimationFrame(checkUrlChange);
  };
  requestAnimationFrame(checkUrlChange);

  // 6. 哈希修正逻辑（增强版）
  const handleHashUpdate = () => {
    const rawHash = decodeURIComponent(window.location.hash);
    if (!rawHash) return;

    const newHash = rawHash.replaceAll(REPLACE_CONFIG.targetString, REPLACE_CONFIG.replaceTo);
    if (rawHash !== newHash) {
      const targetElement = document.getElementById(newHash.replace('#', ''));
      if (targetElement) {
        history.replaceState(null, '', newHash);
        targetElement.scrollIntoView({ behavior: 'instant' });
      }
    }
  };
})();