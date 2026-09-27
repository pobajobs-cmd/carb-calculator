// Pulls the list of journal posts straight from the repo's folder structure.
// No file anywhere needs to name each post — add a folder under /journal/,
// and it shows up here automatically next time someone visits the site.
//
// How it finds posts:
//   1. Asks GitHub's public API what folders exist inside /journal/
//   2. For each folder, fetches that post's own index.html
//   3. Reads its title/date/summary from three <meta> tags in the <head>
//      (see post-template.html for exactly which ones)
//
// Folder names must be dates like 2026-09-21 — that's what keeps them
// sorting correctly (newest first) with zero extra effort.

const JOURNAL_REPO = 'pobajobs-cmd/carb-calculator';
const JOURNAL_BRANCH = 'main';
const JOURNAL_FOLDER = 'journal';

async function fetchPosts() {
  const listUrl = `https://api.github.com/repos/${JOURNAL_REPO}/contents/${JOURNAL_FOLDER}?ref=${JOURNAL_BRANCH}`;

  let dirs = [];
  try {
    const res = await fetch(listUrl);
    if (res.ok) {
      const items = await res.json();
      dirs = Array.isArray(items) ? items.filter(i => i.type === 'dir') : [];
    }
  } catch (e) {
    // Network hiccup, or the /journal folder doesn't exist yet — just show no posts.
    return [];
  }

  const posts = await Promise.all(dirs.map(async (dir) => {
    const rawUrl = `https://raw.githubusercontent.com/${JOURNAL_REPO}/${JOURNAL_BRANCH}/${JOURNAL_FOLDER}/${dir.name}/index.html`;
    try {
      const res = await fetch(rawUrl);
      if (!res.ok) return null;
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const meta = (name) => doc.querySelector(`meta[name="${name}"]`)?.content?.trim() || '';
      return {
        slug: dir.name,
        date: meta('post-date') || dir.name,
        title: meta('post-title') || dir.name,
        summary: meta('post-summary') || '',
      };
    } catch (e) {
      return null;
    }
  }));

  return posts.filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
}

function fmtPostDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}
