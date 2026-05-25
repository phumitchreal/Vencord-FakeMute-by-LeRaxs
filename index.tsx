/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 LeRaxs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, React, showToast, SelectedChannelStore, UserStore, VoiceStateStore } from "@webpack/common";

const settings = definePluginSettings({
    accountButton: {
        description: "Show a Fake Mute/Deafen button in the voice call UI",
        type: OptionType.BOOLEAN,
        default: true
    },
    domFallback: {
        description: "Re-insert the button if Discord rerenders the voice controls",
        type: OptionType.BOOLEAN,
        default: true
    },
    useAlt: {
        description: "Require Alt for the keyboard shortcut",
        type: OptionType.BOOLEAN,
        default: true
    },
    useCtrl: {
        description: "Require Ctrl for the keyboard shortcut",
        type: OptionType.BOOLEAN,
        default: false
    },
    keyCode: {
        description: "Keyboard key for the shortcut (KeyC, KeyX, etc.)",
        type: OptionType.STRING,
        default: "KeyC"
    }
});

const STYLE_ID = "fake-mute-by-leraxs-style";
let fixated = false;
let domButton: HTMLButtonElement | null = null;
let observer: MutationObserver | null = null;
let retryCount = 0;
const maxRetries = 10;

function injectCSS() {
    if (document.getElementById(STYLE_ID)) return;

    const css = `
        .fake-mute-button-LeRaxs {
            min-width: 32px;
            height: 32px;
            background: none;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 4px;
            padding: 0 8px;
            color: var(--interactive-normal);
            transition: all 0.15s ease;
            box-sizing: border-box;
        }
        .fake-mute-button-LeRaxs:hover {
            background-color: var(--background-modifier-hover);
            color: var(--interactive-hover);
        }
        .fake-mute-button-LeRaxs.active {
            color: var(--status-danger);
            background-color: var(--status-danger-background);
        }
        .fake-mute-button-LeRaxs.active:hover {
            background-color: var(--status-danger-background);
            opacity: 0.8;
        }
        .fake-mute-button-LeRaxs svg {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
        }
    `;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head?.appendChild(style);
}

function clearCSS() {
    const existing = document.getElementById(STYLE_ID);
    existing?.remove();
}

function getSVGIcon() {
    const pathData = fixated
        ? "M5.312 4.566C4.19 5.685-.715 12.681 3.523 16.918c4.236 4.238 11.23-.668 12.354-1.789c1.121-1.119-.335-4.395-3.252-7.312c-2.919-2.919-6.191-4.376-7.313-3.251zm9.264 9.59c-.332.328-2.895-.457-5.364-2.928c-2.467-2.469-3.256-5.033-2.924-5.363c.328-.332 2.894.457 5.36 2.926c2.471 2.467 3.258 5.033 2.928 5.365zm.858-8.174l1.904-1.906a.999.999 0 1 0-1.414-1.414L14.02 4.568a.999.999 0 1 0 1.414 1.414zM11.124 3.8a1 1 0 0 0 1.36-.388l1.087-1.926a1 1 0 0 0-1.748-.972L10.736 2.44a1 1 0 0 0 .388 1.36zm8.748 3.016a.999.999 0 0 0-1.36-.388l-1.94 1.061a1 1 0 1 0 .972 1.748l1.94-1.061a1 1 0 0 0 .388-1.36z"
        : "M14.201 9.194c1.389 1.883 1.818 3.517 1.559 3.777c-.26.258-1.893-.17-3.778-1.559l-5.526 5.527c4.186 1.838 9.627-2.018 10.605-2.996c.925-.922.097-3.309-1.856-5.754l-1.004 1.005zM8.667 7.941c-1.099-1.658-1.431-3.023-1.194-3.26c.233-.234 1.6.096 3.257 1.197l1.023-1.025C9.489 3.179 7.358 2.519 6.496 3.384c-.928.926-4.448 5.877-3.231 9.957l5.402-5.4zm9.854-6.463a.999.999 0 0 0-1.414 0L1.478 17.108a.999.999 0 1 0 1.414 1.414l15.629-15.63a.999.999 0 0 0 0-1.414z";
    return `<svg viewBox="0 0 20 20"><path fill="currentColor" d="${pathData}"/></svg>`;
}

function updateDOMButton() {
    if (!domButton) return;
    domButton.innerHTML = getSVGIcon();
    const label = fixated ? "ปิด Fake Mute/Deafen" : "เปิด Fake Mute/Deafen";
    domButton.title = label;
    domButton.setAttribute("aria-label", label);
    domButton.classList.toggle("active", fixated);
}

function createDOMButton() {
    const button = document.createElement("button");
    button.className = "fake-mute-button-LeRaxs";
    button.setAttribute("aria-label", fixated ? "ปิด Fake Mute/Deafen" : "เปิด Fake Mute/Deafen");
    button.title = fixated ? "ปิด Fake Mute/Deafen" : "เปิด Fake Mute/Deafen";
    button.innerHTML = getSVGIcon();
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFixate();
    });
    return button;
}

function findButtonContainer() {
    return document.querySelector("[class*='voiceButtonsContainer']");
}

function tryDOMMethod() {
    if (!settings.store.accountButton) return;
    if (domButton && document.contains(domButton)) return;

    const container = findButtonContainer();
    if (!container) {
        if (retryCount < maxRetries) {
            retryCount += 1;
            window.setTimeout(tryDOMMethod, 1000);
        }
        return;
    }

    domButton = createDOMButton();
    const firstChild = container.firstElementChild;
    if (firstChild) {
        container.insertBefore(domButton, firstChild);
    } else {
        container.appendChild(domButton);
    }
}

function setupDOMObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
        if (!domButton || !document.contains(domButton)) {
            if (settings.store.domFallback && settings.store.accountButton) {
                window.setTimeout(tryDOMMethod, 500);
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

function getVoiceChannelId(): string | null {
    try {
        const voiceChannelId = SelectedChannelStore.getVoiceChannelId();
        if (voiceChannelId) return voiceChannelId;
    } catch {}

    try {
        const currentUser = UserStore.getCurrentUser();
        const state = VoiceStateStore.getVoiceStateForUser(currentUser.id);
        return state?.channelId ?? null;
    } catch {
        return null;
    }
}

function showPluginToast(message: string, type: "success" | "failure" | "message" = "message") {
    showToast(`แอบฟังอยู่นะจ้ะ: ${message}`, type);
}

function toggleFixate(status: boolean | null = null) {
    if (!getVoiceChannelId()) {
        showPluginToast("เข้าห้องเสียงก่อนนะ!", "failure");
        return;
    }

    fixated = status === null ? !fixated : status;
    updateDOMButton();

    if (fixated) {
        enableFakeMute();
        showPluginToast("Fake Mute/Deafen เปิดใช้งานแล้ว", "success");
    } else {
        disableFakeMute();
        showPluginToast("Fake Mute/Deafen ปิดใช้งานแล้ว", "message");
    }
}

const wsProto = WebSocket.prototype as any;

function patchWebSocket() {
    if (!wsProto.fakeMuteLeRaxsOriginal) {
        wsProto.fakeMuteLeRaxsOriginal = wsProto.send;
    }
}

function enableFakeMute() {
    const originalSend = wsProto.fakeMuteLeRaxsOriginal ?? wsProto.send;
    wsProto.send = function (data: unknown) {
        try {
            if (typeof data === "string") {
                if (data.includes('"self_deaf"') || data.includes('"self_mute"')) {
                    return;
                }
            } else if (data instanceof ArrayBuffer) {
                const decoded = new TextDecoder("utf-8", { fatal: false }).decode(data);
                if (decoded.includes('self_deaf') || decoded.includes('self_mute')) {
                    return;
                }
            }
        } catch {
            // ignore
        }

        return originalSend.call(this, data);
    };
}

function disableFakeMute() {
    if (wsProto.fakeMuteLeRaxsOriginal) {
        wsProto.send = wsProto.fakeMuteLeRaxsOriginal;
    }
}

function unpatchWebSocket() {
    if (wsProto.fakeMuteLeRaxsOriginal) {
        wsProto.send = wsProto.fakeMuteLeRaxsOriginal;
        delete wsProto.fakeMuteLeRaxsOriginal;
    }
}

function onKeyDown(e: KeyboardEvent) {
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
    if (e.metaKey) return;
    if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target.isContentEditable) return;
    }

    const needAlt = settings.store.useAlt;
    const needCtrl = settings.store.useCtrl;
    const targetKey = settings.store.keyCode ?? 'KeyC';

    const altOk = needAlt ? e.altKey : !e.altKey;
    const ctrlOk = needCtrl ? e.ctrlKey : !e.ctrlKey;
    const keyOk = e.code === targetKey;

    if (altOk && ctrlOk && keyOk) {
        e.preventDefault();
        e.stopPropagation();
        toggleFixate();
    }
}

function registerKeyboardShortcut() {
    document.addEventListener('keydown', onKeyDown, true);
}

function unregisterKeyboardShortcut() {
    document.removeEventListener('keydown', onKeyDown, true);
}

const audioDeviceContextPatch = (children: Array<any>) => {
    if (!Array.isArray(children)) return;
    children.push(
        React.createElement(Menu.MenuSeparator, { key: "vc-fake-mute-separator" }),
        React.createElement(Menu.MenuItem, {
            key: "vc-fake-mute-item",
            id: "vc-fake-mute-item",
            label: `Fake Mute/Deafen โดย LeRaxs (${settings.store.useAlt ? 'Alt+' : ''}${settings.store.useCtrl ? 'Ctrl+' : ''}${(settings.store.keyCode ?? 'KeyC').replace('Key', '')})`,
            action: () => toggleFixate()
        })
    );
};

export default definePlugin({
    name: "แอบฟังอยู่นะจ้ะ",
    description: "Fake Mute/Deafen โดยกรอง packet self_mute/self_deaf",
    tags: ["Voice", "Utility"],
    authors: [{ name: "LeRaxs", id: 0n }],
    settings,
    contextMenus: {
        "audio-device-context": audioDeviceContextPatch
    },
    start() {
        injectCSS();
        patchWebSocket();
        if (settings.store.accountButton) {
            tryDOMMethod();
        }
        setupDOMObserver();
        registerKeyboardShortcut();
    },
    stop() {
        unregisterKeyboardShortcut();
        unpatchWebSocket();

        if (domButton && domButton.parentElement) {
            domButton.parentElement.removeChild(domButton);
            domButton = null;
        }

        observer?.disconnect();
        observer = null;
        clearCSS();
    }
});
