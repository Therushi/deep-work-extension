// src/background/blocker.ts

const RULE_ID_START = 1000;
// MV3 declarativeNetRequest redirect to our blocked page
const BLOCKED_PAGE = chrome.runtime.getURL("src/blocked/blocked.html");

function siteToRuleId(index: number): number {
  return RULE_ID_START + index;
}

/**
 * Apply blocking rules for all sites in the list.
 * Each site gets a redirect rule pointing to blocked.html.
 */
export async function applyRules(
  sites: string[],
  whitelistMode: boolean,
): Promise<void> {
  // Clear existing rules first
  await removeAll();

  if (sites.length === 0) return;

  let rules: chrome.declarativeNetRequest.Rule[];

  if (whitelistMode) {
    // Block everything, then allow listed sites
    rules = [
      {
        id: RULE_ID_START,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
          redirect: { url: BLOCKED_PAGE },
        },
        condition: {
          urlFilter: "*",
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        },
      },
      // Allow rules have higher priority
      ...sites.map((site, i) => ({
        id: RULE_ID_START + 1 + i,
        priority: 2,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.ALLOW,
        } as chrome.declarativeNetRequest.RuleAction,
        condition: {
          requestDomains: [site],
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        },
      })),
    ];
  } else {
    // Block listed sites only
    rules = sites.map((site, i) => ({
      id: siteToRuleId(i),
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
        redirect: {
          url: `${BLOCKED_PAGE}?site=${encodeURIComponent(site)}`,
        },
      } as chrome.declarativeNetRequest.RuleAction,
      condition: {
        requestDomains: [site],
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
      },
    }));
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: rules,
    removeRuleIds: [],
  });
}

/**
 * Remove all dynamic blocking rules.
 */
export async function removeAll(): Promise<void> {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  if (existing.length === 0) return;
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: [],
  });
}
