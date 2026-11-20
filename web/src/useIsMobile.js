import { useEffect, useState } from 'react';

// 移动断点：屏宽 <768px 走手机布局；≥768px 保持电脑版原样。
// 用 matchMedia 订阅，旋转屏/拖窗口即时切换，不靠 resize 节流。
const QUERY = '(max-width: 767px)';

export function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(QUERY).matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e) => setMobile(e.matches);
    onChange(mql);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return mobile;
}