// 配置参数：定义要替换的字符和目标
const REPLACE_CONFIG = {
    targetString: '%26',      // 需要替换的原始字符串（已编码形式）
    replaceTo: 'and',         // 替换后的字符串
    attribute: 'id',          // 需要监控的属性
    hashUpdate: true          // 是否自动修正URL哈希
  };
  
  (function() {
    // 1. 定义ID替换函数
    const replaceEncodedIds = (element) => {
      const oldId = element.getAttribute(REPLACE_CONFIG.attribute);
      if (!oldId || !oldId.includes(REPLACE_CONFIG.targetString)) return;
  
      const newId = oldId.replaceAll(REPLACE_CONFIG.targetString, REPLACE_CONFIG.replaceTo);
      
      // 冲突检测
      if (!document.getElementById(newId)) {
        element.setAttribute(REPLACE_CONFIG.attribute, newId);
        console.log(`ID更新: ${oldId} → ${newId}`);
        
        // 如果当前元素的ID是URL哈希目标，触发滚动修正
        if (REPLACE_CONFIG.hashUpdate && `#${newId}` === window.location.hash) {
          requestAnimationFrame(() => element.scrollIntoView());
        }
      }
    };
  
    // 2. 创建MutationObserver监听DOM变化
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        // 处理新增节点
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // 仅处理元素节点
            if (node.hasAttribute(REPLACE_CONFIG.attribute)) {
              replaceEncodedIds(node);
            }
            // 检查子元素
            node.querySelectorAll(`[${REPLACE_CONFIG.attribute}*="${REPLACE_CONFIG.targetString}"]`).forEach(replaceEncodedIds);
          }
        });
  
        // 处理属性变更
        if (mutation.type === 'attributes' && mutation.attributeName === REPLACE_CONFIG.attribute) {
          replaceEncodedIds(mutation.target);
        }
      });
    });
  
    // 3. 启动全局监听
    observer.observe(document.documentElement, {
      subtree: true,                   // 监控整个DOM树
      childList: true,                  // 监控子元素变化
      attributeFilter: [REPLACE_CONFIG.attribute] // 仅监听指定属性
    });
  
    // 4. 立即扫描现有内容
    document.querySelectorAll(`[${REPLACE_CONFIG.attribute}*="${REPLACE_CONFIG.targetString}"]`).forEach(replaceEncodedIds);
  
    // 5. 路由变化监听（支持SPA）
    let lastURL = location.href;
    setInterval(() => {
      if (lastURL !== location.href) {
        lastURL = location.href;
        // 重新扫描所有元素
        document.querySelectorAll(`[${REPLACE_CONFIG.attribute}*="${REPLACE_CONFIG.targetString}"]`).forEach(replaceEncodedIds);
        // 强制哈希修正
        handleHashUpdate();
      }
    }, 200);
  
    // 6. 哈希修正逻辑
    const handleHashUpdate = () => {
      const rawHash = window.location.hash;
      if (!rawHash) return;
  
      const decodedHash = decodeURIComponent(rawHash);
      const targetId = decodedHash.replaceAll(REPLACE_CONFIG.targetString, REPLACE_CONFIG.replaceTo);
      
      if (decodedHash !== targetId) {
        const targetElement = document.getElementById(targetId.replace('#', ''));
        if (targetElement) {
          history.replaceState(null, '', `#${targetId}`);
          targetElement.scrollIntoView({ behavior: 'auto' });
        }
      }
    };
  })();