// 手机布局的分段页签（讲解|代码区 / 题目|代码区）。
// 同一片玻璃里切换，选中态只变透明度不变色相（材质单一状态规则）。
// 触控目标 ≥44px。仅移动分支使用，电脑版不引用。
export default function SegTabs({ tabs, value, onChange }) {
  return (
    <div className="seg-tabs flex gap-1 p-1 rounded-xl border border-line bg-paper-deep/50">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`flex-1 min-h-[40px] py-2 rounded-lg text-[13px] font-medium transition-colors ${
            value === t.id
              ? 'bg-card text-cinnabar shadow-sm border border-line/70'
              : 'text-ink-soft border border-transparent hover:text-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}