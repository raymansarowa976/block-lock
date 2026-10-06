export type BumpType = "patch" | "minor" | "major"

export function isValidChromeVersion(version: string): boolean
export function bumpVersion(version: string, type: BumpType | string): string
export function changelogHasVersion(changelog: string, version: string): boolean
export function releaseChangelog(changelog: string, version: string, date: string): string
export function findReleaseProblems(input: {
  manifestVersion: string
  packageVersion: string
  changelog: string
}): string[]
