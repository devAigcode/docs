const REPLACE_CONFIG = {
  targetString: '%26',
  replaceTo: 'and',
  attributes: ['id', 'href'],
  hashUpdate: true
};

const STRONG_TAG_REGEX = /<strong>(.*?)<\/strong>/gi;

const FOOTER_ICON_REPLACEMENT = {
  targetUrl: 'https://mintlify.b-cdn.net/v6.6.0/brands/discord.svg',
  newUrl: "https://cdn-medstudy-test.yidao.pro/2025%2F05%2F22%2F8edd9eba1f1c43a094f91e973f7102b9.svg",
  styleRegex: /url\(["']?https:\/\/mintlify\.b-cdn\.net\/v6\.6\.0\/brands\/discord\.svg["']?\)/gi
};

(function() {
  // 1. 通用属性替换逻辑
  const replaceEncodedAttribute = (element, attr) => {
    const oldValue = element.getAttribute(attr);
    if (!oldValue || !oldValue.includes(REPLACE_CONFIG.targetString)) return;

    const newValue = oldValue.replaceAll(REPLACE_CONFIG.targetString, REPLACE_CONFIG.replaceTo);

    if (attr === 'id') {
      if (!document.getElementById(newValue)) {
        element.setAttribute(attr, newValue);
        console.log(`ID更新: ${oldValue} → ${newValue}`);
        
        if (REPLACE_CONFIG.hashUpdate && `#${newValue}` === window.location.hash) {
          requestAnimationFrame(() => element.scrollIntoView());
        }
      }
    } else if (attr === 'href') {
      element.setAttribute(attr, newValue);
      console.log(`HREF更新: ${oldValue} → ${newValue}`);
    }
  };

  // 2. 强标签处理逻辑
  const processStrongTags = (node) => {
    if (node.nodeType !== Node.TEXT_NODE || !STRONG_TAG_REGEX.test(node.textContent)) return;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = node.textContent.replaceAll(
      STRONG_TAG_REGEX,
      '<strong>$1</strong>'
    );

    const parent = node.parentNode;
    const newNodes = [...tempDiv.childNodes];
    newNodes.forEach(newNode => parent.insertBefore(newNode, node));
    parent.removeChild(node);
  };

  const processDOMSubtree = (root) => {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: function(node) {
          if (node.nodeType === Node.TEXT_NODE && STRONG_TAG_REGEX.test(node.textContent)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            return NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    let currentNode;
    while ((currentNode = walker.nextNode())) {
      processStrongTags(currentNode);
    }
  };

  // 3. Footer SVG处理逻辑
  const replaceFooterSVGStyle = (svgElement) => {
    const styleValue = svgElement.getAttribute('style');
    if (!styleValue || !FOOTER_ICON_REPLACEMENT.styleRegex.test(styleValue)) return;

    const newStyle = styleValue.replace(
      FOOTER_ICON_REPLACEMENT.styleRegex,
      `url('${FOOTER_ICON_REPLACEMENT.newUrl}')`
    );
    svgElement.setAttribute('style', newStyle);
  };

  const checkFooterSVGs = () => {
    document.querySelectorAll('footer svg[style]').forEach(replaceFooterSVGStyle);
  };

  // 4. 核心Observer逻辑
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      // 处理新增节点
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          processDOMSubtree(node);
          REPLACE_CONFIG.attributes.forEach(attr => {
            if (node.hasAttribute(attr)) replaceEncodedAttribute(node, attr);
            node.querySelectorAll(`[${attr}]`).forEach(replaceEncodedAttribute);
          });

          if (node.closest('footer') && node.matches('svg')) {
            replaceFooterSVGStyle(node);
          }
        } else if (node.nodeType === Node.TEXT_NODE) {
          processStrongTags(node);
        }
      });

      // 处理属性变更
      if (mutation.type === 'attributes') {
        if (REPLACE_CONFIG.attributes.includes(mutation.attributeName)) {
          replaceEncodedAttribute(mutation.target, mutation.attributeName);
        }
        if (mutation.attributeName === 'style' && 
            mutation.target.closest('footer') && 
            mutation.target.matches('svg')) {
          replaceFooterSVGStyle(mutation.target);
        }
      }
    });
  });

  // 5. 初始化设置
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributeFilter: [...REPLACE_CONFIG.attributes, 'style']
  });

  // 初始扫描
  REPLACE_CONFIG.attributes.forEach(attr => {
    document.querySelectorAll(`[${attr}*="${REPLACE_CONFIG.targetString}"]`).forEach(el => {
      replaceEncodedAttribute(el, attr);
    });
  });
  processDOMSubtree(document.body);
  checkFooterSVGs();

  // 6. SPA路由监听
  let lastPath = location.pathname + location.hash;
  const checkUrlChange = () => {
    if (lastPath !== (location.pathname + location.hash)) {
      lastPath = location.pathname + location.hash;
      REPLACE_CONFIG.attributes.forEach(attr => {
        document.querySelectorAll(`[${attr}*="${REPLACE_CONFIG.targetString}"]`).forEach(el => {
          replaceEncodedAttribute(el, attr);
        });
      });
      processDOMSubtree(document.body);
      checkFooterSVGs();
      handleHashUpdate();
    }
    requestAnimationFrame(checkUrlChange);
  };
  requestAnimationFrame(checkUrlChange);

  // 7. 哈希修正
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

  // 8. 原型拦截保护
  const originalSetAttribute = SVGElement.prototype.setAttribute;
  SVGElement.prototype.setAttribute = function(name, value) {
    if (name === 'style' && this.closest('footer')) {
      value = value.replace(
        FOOTER_ICON_REPLACEMENT.styleRegex,
        `url('${FOOTER_ICON_REPLACEMENT.newUrl}')`
      );
    }
    originalSetAttribute.call(this, name, value);
  };
})();