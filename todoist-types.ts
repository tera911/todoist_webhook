interface TodoProject {
    id: number;
    name: string;
    color: number;
    indent: number;
    item_order: number;
    collapsed: number;
    shared: boolean;
    is_deleted: number;
    is_archived: number;
    is_favorite: number;
    inbox_project: boolean;
    team_inbox: boolean;
}

interface TodoItem {
    id: number;
    user_id: number;
    project_id: number;
    content: string;
    date_string: string;
    date_lang: string;
    due_date_utc: string;
    priority: number;
    indent: number;
    item_order: number;
    day_order: number;
    collapsed: number;
    labels: number[];
    assigned_by_uid: number;
    responsible_uid: number;
    checked: number;
    in_history: number;
    is_deleted: number;
    is_archived: number;
    sync_id: number;
    date_added: string;
}

interface TodoUser {
    id: number;
    token: string;
    email: string;
    full_name: string;
    image_id: string;
}

interface SyncCollaborators {
    sync_token: string;
    collaborator_states: any;
    collaborators: TodoUser[];
}

interface SyncItems {
    sync_token: string;
    items: TodoItem[]
}

interface TodoItemUpdateEvent {
    user_id: number;
    event_data: {
        id: number;
        sync_id: number | null;
        project_id: number;
        user_id: number | null;
        responsible_uid: number | null;
    }
}

interface PoolTask {
    id: number;
    project_id: number;
}
