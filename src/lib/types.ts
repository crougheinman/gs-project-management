export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
};

export type Project = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  color: string | null;
  visibility: "workspace" | "private";
  status: "active" | "archived";
};

export type Section = {
  id: string;
  project_id: string;
  name: string;
  position: number;
};

export type Task = {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  section_id: string | null;
  assignee_id: string | null;
  name: string;
  description: { text: string } | null;
  completed: boolean;
  due_date: string | null;
  start_date: string | null;
  position: number;
  assignee?: Pick<Profile, "id" | "full_name" | "email"> | null;
};

export type Tag = {
  id: string;
  workspace_id: string;
  name: string;
  color: string | null;
};

export type TaskTag = {
  task_id: string;
  tag_id: string;
};
