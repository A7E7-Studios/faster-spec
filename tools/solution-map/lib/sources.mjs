// The map's own reads of a repository: its origin's address and a file at a commit. Which
// repositories, and fetching them, are tools/gate/lib/repos.mjs.
import { gitAsync } from '../../gate/lib/git.mjs';

/** The address of a repository's origin, or null. */
export async function remoteUrl(dir) {
  const r = await gitAsync(dir, ['remote', 'get-url', 'origin']);
  return r.ok ? String(r.out).trim() : null;
}

/** A file at a commit, or null. */
export async function readAt(dir, commit, p) {
  const r = await gitAsync(dir, ['show', `${commit}:${p}`]);
  return r.ok ? r.out : null;
}
