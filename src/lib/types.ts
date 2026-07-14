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

export type TaskType = "epic" | "task" | "subtask";

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
  task_type: TaskType;
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

// Tiptap document JSON (loosely typed - we only walk it)
export type TiptapDoc = {
  type: string;
  content?: TiptapNode[];
};

export type TiptapNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: TiptapNode[];
};

export type Comment = {
  id: string;
  task_id: string;
  author_id: string;
  body: TiptapDoc;
  created_at: string;
  author?: Pick<Profile, "id" | "full_name" | "email"> | null;
};

export type Attachment = {
  id: string;
  task_id: string | null;
  comment_id: string | null;
  uploaded_by: string | null;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
};

export type ActivityEntry = {
  id: string;
  project_id: string | null;
  task_id: string | null;
  actor_id: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor?: Pick<Profile, "id" | "full_name" | "email"> | null;
};

export type CustomFieldType =
  | "text"
  | "number"
  | "single_select"
  | "multi_select"
  | "date"
  | "checkbox"
  | "person";

export type SelectOption = { id: string; label: string; color?: string | null };

export type CustomField = {
  id: string;
  project_id: string;
  name: string;
  field_type: CustomFieldType;
  options: SelectOption[];
  position: number;
};

export type CustomFieldValue = {
  id: string;
  custom_field_id: string;
  task_id: string;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_boolean: boolean | null;
  value_option_ids: string[] | null;
  value_user_id: string | null;
};

export type TaskDependency = {
  id: string;
  task_id: string; // blocked
  depends_on_task_id: string; // blocker
};

export type Notification = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: "assigned" | "mentioned" | "comment_added" | "added_to_project";
  project_id: string | null;
  task_id: string | null;
  comment_id: string | null;
  message: string;
  read: boolean;
  created_at: string;
};
