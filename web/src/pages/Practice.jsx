export default function Practice() {
  return (
    <div className="h-full grid place-items-center p-8">
      <div className="text-center max-w-md fade-up">
        <div className="seal w-14 h-14 mx-auto flex items-center justify-center text-2xl font-bold mb-5">练</div>
        <h2 className="font-display text-2xl font-bold mb-3">练习与错题本</h2>
        <p className="text-sm text-ink-soft leading-relaxed">
          按技能树节点刷题，测试用例自动判题，错题记录错因、安排间隔重练。
          小节小总结、模块大总结的综合题也在这里。
        </p>
        <p className="text-xs text-ink-faint mt-5">阶段 3 开放</p>
      </div>
    </div>
  );
}