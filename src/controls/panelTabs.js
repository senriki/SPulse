// Wires a panel's sticky tab bar: clicking a .tab-btn shows its matching
// .tab-panel (data-tab-group === button's data-tab) and hides the others.
// Called once per panel (#left-panel, #right-panel) from renderer.js.
// Purely reactive to clicks — the initial active/hidden state is set in the
// HTML itself (src/index.html), not forced here.
export function initPanelTabs(root) {
  const tabBtns   = root.querySelectorAll('.tab-btn')
  const tabPanels = root.querySelectorAll('.tab-panel')

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.toggle('active', b === btn))
      tabPanels.forEach(panel => {
        panel.classList.toggle('hidden', panel.dataset.tabGroup !== btn.dataset.tab)
      })
    })
  })
}
