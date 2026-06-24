const signedInSignals = {
  signOutButton: document.querySelector("#signOutButton"),
  statusTitle: document.querySelector("#cloudStatusTitle"),
  syncBadge: document.querySelector("#syncBadge"),
  emailInput: document.querySelector("#emailInput"),
};

function refreshSignedInUi() {
  const isSignedIn =
    signedInSignals.signOutButton &&
    !signedInSignals.signOutButton.classList.contains("is-hidden");

  document.body.classList.toggle("is-signed-in", Boolean(isSignedIn));

  if (signedInSignals.syncBadge) {
    signedInSignals.syncBadge.textContent = isSignedIn ? "Synced" : "Local";
  }

  if (isSignedIn && signedInSignals.emailInput) {
    signedInSignals.emailInput.setAttribute("readonly", "true");
  } else if (signedInSignals.emailInput) {
    signedInSignals.emailInput.removeAttribute("readonly");
  }
}

const observer = new MutationObserver(refreshSignedInUi);

if (signedInSignals.signOutButton) {
  observer.observe(signedInSignals.signOutButton, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

if (signedInSignals.statusTitle) {
  observer.observe(signedInSignals.statusTitle, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}

refreshSignedInUi();
