const TOGGL_API_BASE = "https://api.track.toggl.com/api/v9";

function getAuthHeader(): string {
  const token = process.env.TOGGL_API_TOKEN;
  if (!token) {
    throw new Error("TOGGL_API_TOKEN is not defined");
  }
  return `Basic ${Buffer.from(`${token}:api_token`).toString("base64")}`;
}

async function togglFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${TOGGL_API_BASE}${path}`, {
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Toggl API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

type TogglTimeEntry = {
  id: number;
  description: string;
  start: string;
  stop: string | null;
  duration: number; // seconds (-1 if running)
  project_id: number | null;
  workspace_id: number;
};

type TogglProject = {
  id: number;
  name: string;
};

export type ProjectSummary = {
  projectName: string;
  totalSeconds: number;
  entries: { description: string; seconds: number; start: string; stop: string | null }[];
};

/**
 * 当日のタイムエントリを取得する
 */
export const getTodayTimeEntries = async (): Promise<TogglTimeEntry[]> => {
  // JST (UTC+9) で「今日」を計算する
  const nowUtc = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const nowJst = new Date(nowUtc.getTime() + jstOffset);
  const yyyy = nowJst.getUTCFullYear();
  const mm = String(nowJst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(nowJst.getUTCDate()).padStart(2, "0");

  const startDate = new Date(`${yyyy}-${mm}-${dd}T00:00:00+09:00`);
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

  return togglFetch<TogglTimeEntry[]>(
    `/me/time_entries?start_date=${encodeURIComponent(startDate.toISOString())}&end_date=${encodeURIComponent(endDate.toISOString())}`
  );
};

/**
 * ワークスペースのプロジェクト一覧を取得する
 */
const getProjects = async (workspaceId: number): Promise<TogglProject[]> => {
  return togglFetch<TogglProject[]>(`/workspaces/${workspaceId}/projects`);
};

/**
 * プロジェクト別に集計する
 */
export const summarizeByProject = async (
  entries: TogglTimeEntry[]
): Promise<ProjectSummary[]> => {
  if (entries.length === 0) return [];

  // ワークスペースIDを取得（最初のエントリから）
  const workspaceId = entries[0].workspace_id;
  const projects = await getProjects(workspaceId);
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  const summaryMap = new Map<string, ProjectSummary>();

  for (const entry of entries) {
    // duration が負の場合（実行中）はスキップ
    if (entry.duration < 0) continue;

    const projectName = entry.project_id
      ? projectMap.get(entry.project_id) ?? "Unknown"
      : "No Project";

    if (!summaryMap.has(projectName)) {
      summaryMap.set(projectName, {
        projectName,
        totalSeconds: 0,
        entries: [],
      });
    }

    const summary = summaryMap.get(projectName)!;
    summary.totalSeconds += entry.duration;
    summary.entries.push({
      description: entry.description || "(no description)",
      seconds: entry.duration,
      start: entry.start,
      stop: entry.stop,
    });
  }

  return Array.from(summaryMap.values());
};

/**
 * ISO文字列を "HH:MM" 形式に変換する
 */
export const formatTime = (isoString: string): string => {
  const date = new Date(isoString);
  // JST (UTC+9) で表示する
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCHours().toString().padStart(2, "0")}:${jst.getUTCMinutes().toString().padStart(2, "0")}`;
};

/**
 * 秒数を "Xh Xm" 形式に変換する
 */
export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};
