export function askMemberNotification({ requiredMessage = "" } = {}) {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.className = "member-notify-admin";
    dialog.setAttribute("aria-label", "是否通知會員");
    dialog.innerHTML = `<form method="dialog">
      <h2>是否通知會員？</h2>
      <p></p>
      <label>給會員的備註（選填）
        <textarea maxlength="200" rows="3"></textarea>
      </label>
      <div class="member-notify-actions">
        <button type="submit" value="cancel">取消異動</button>
        <button type="submit" value="silent">不通知，繼續</button>
        <button type="submit" value="notify">通知會員並繼續</button>
      </div>
    </form>`;
    dialog.querySelector("p").textContent = requiredMessage || "備註會顯示在通知內，請只填寫要讓會員看到的內容。";
    dialog.querySelector('[value="silent"]').hidden = Boolean(requiredMessage);
    dialog.addEventListener("close", () => {
      const choice = dialog.returnValue;
      const note = dialog.querySelector("textarea").value.trim();
      dialog.remove();
      resolve(choice === "notify" ? { notify_member: true, notification_note: note } :
        choice === "silent" ? { notify_member: false } : null);
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
}
