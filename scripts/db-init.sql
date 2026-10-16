-- ============================================================
-- the-bot · 数据库初始化脚本（PostgreSQL）
-- ============================================================
-- 用途：为新环境快速建立当前生产 schema，免去逐个跑 src/core/database/migrations/* 的过程。
-- 来源：自 PG database `the_bot_test` 在 spec 2026-05-09 版本以 pg_dump --schema-only 导出。
-- 范围：public schema · 79 张业务表 + 全部 idx / fk / type / constraint。
--
-- 用法（新建空库）：
--   createdb -h localhost -p 5432 -U postgres the_bot_xxx
--   psql -h localhost -p 5432 -U postgres -d the_bot_xxx -f scripts/db-init.sql
--
-- 注意：
--   1. 仅 schema，无任何业务数据；填充 seed / fixture 走应用层
--   2. web 启动（src/web/server/index.ts）仍会跑后续增量迁移；如果用本脚本初始化后启动 server，
--      已存在的列 / 索引会被迁移脚本的 IF NOT EXISTS / pragma 检查自然跳过（迁移本就幂等）
--   3. 后续新增 ALTER：仍走 src/core/database/migrations/ 增量迁移；本初始化脚本由维护者按节点周期重导
-- ============================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.13 (Debian 16.13-1.pgdg12+1)
-- Dumped by pg_dump version 18.3 (Ubuntu 18.3-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    provider character varying NOT NULL,
    encrypted_key text NOT NULL,
    endpoint text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: asset_image; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_image (
    id character varying NOT NULL,
    user_id character varying,
    asset_type character varying NOT NULL,
    asset_id character varying NOT NULL,
    category character varying NOT NULL,
    label text,
    prompt text,
    negative_prompt text,
    image_path text NOT NULL,
    thumbnail_path text,
    is_main integer DEFAULT 0 NOT NULL,
    derived_from_image_id character varying,
    sort_order integer DEFAULT 0 NOT NULL,
    metadata text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: character_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_bindings (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    long_writing_character_id character varying,
    portrait_id text,
    generate_config text,
    voice_config text NOT NULL,
    voice_id text,
    voice_speed real DEFAULT '1'::real,
    voice_pitch real DEFAULT '1'::real,
    base_description text,
    style_reference text,
    additional_prompts text,
    source_type text DEFAULT 'standalone'::text NOT NULL,
    override_name text,
    override_description text,
    override_appearance text,
    override_outfit text,
    standalone_name text,
    standalone_description text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    alias text,
    role text,
    gender text,
    age integer,
    voice_emotion text,
    style_anchors text,
    outfits_extra text,
    race text,
    reference_image_path text
);


--
-- Name: cloned_voices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cloned_voices (
    user_id character varying,
    id character varying NOT NULL,
    name character varying NOT NULL,
    status character varying DEFAULT 'training'::character varying NOT NULL,
    sample_audio_path text,
    sample_duration integer,
    voice_id text,
    preview_audio_path text,
    provider_id text,
    error_message text,
    created_at text NOT NULL,
    updated_at text
);


--
-- Name: dialogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dialogs (
    user_id character varying,
    id character varying NOT NULL,
    title character varying NOT NULL,
    model_id character varying NOT NULL,
    provider_config_id text,
    role_id text,
    system_prompt text,
    context_config text,
    knowledge_base_ids text,
    web_search_config text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    message_count integer DEFAULT 0 NOT NULL
);


--
-- Name: diary_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diary_attachments (
    user_id character varying,
    id character varying NOT NULL,
    entry_id character varying NOT NULL,
    file_name character varying NOT NULL,
    file_path text NOT NULL,
    file_size integer,
    mime_type text,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: diary_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diary_entries (
    user_id character varying,
    id character varying NOT NULL,
    folder_id character varying NOT NULL,
    title character varying NOT NULL,
    content text,
    file_path text NOT NULL,
    word_count integer DEFAULT 0 NOT NULL,
    tags text,
    frontmatter text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: diary_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diary_folders (
    user_id character varying,
    id character varying NOT NULL,
    name character varying NOT NULL,
    parent_id text,
    path text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: diary_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diary_links (
    user_id character varying,
    id character varying NOT NULL,
    source_entry_id character varying NOT NULL,
    target_entry_id text,
    target_title character varying NOT NULL,
    link_text text,
    anchor text,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: episode_scripts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.episode_scripts (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    episode_id character varying NOT NULL,
    outline_id character varying,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    synopsis text,
    script_content text,
    script_format text DEFAULT 'standard'::text,
    scenes text,
    total_duration integer DEFAULT 0 NOT NULL,
    character_appearances text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: image_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.image_assets (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    type character varying NOT NULL,
    provider text,
    model text,
    prompt text NOT NULL,
    negative_prompt text,
    image_path text NOT NULL,
    thumbnail_path text,
    width integer NOT NULL,
    height integer NOT NULL,
    metadata text,
    created_at bigint NOT NULL
);


--
-- Name: images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.images (
    user_id character varying,
    id character varying NOT NULL,
    dialog_id text,
    message_id text,
    file_path text NOT NULL,
    file_name text,
    file_size integer,
    mime_type text,
    width integer,
    height integer,
    prompt text,
    negative_prompt text,
    style text,
    quality text,
    provider_id text,
    model_id text,
    generation_params text,
    seed integer,
    task_id text,
    status character varying DEFAULT 'completed'::character varying NOT NULL,
    error_message text,
    favorite integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: item_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_bindings (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    long_writing_item_id character varying,
    item_name character varying NOT NULL,
    image_paths text,
    thumbnail_path text,
    generate_config text,
    base_description text,
    style_reference text,
    additional_prompts text,
    generate_images integer DEFAULT 0 NOT NULL,
    source_type text DEFAULT 'standalone'::text NOT NULL,
    override_name text,
    override_description text,
    standalone_name text,
    standalone_description text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    style_anchors text,
    reference_image_path text
);


--
-- Name: kb_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_chunks (
    user_id character varying,
    id character varying NOT NULL,
    document_id character varying NOT NULL,
    knowledge_base_id character varying NOT NULL,
    content text NOT NULL,
    chunk_index integer NOT NULL,
    start_offset integer,
    end_offset integer,
    title text,
    level integer DEFAULT 1,
    parent_chunk_id text,
    split_method text,
    section_path text,
    metadata text,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: kb_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_documents (
    user_id character varying,
    id character varying NOT NULL,
    knowledge_base_id character varying NOT NULL,
    name character varying NOT NULL,
    file_path text NOT NULL,
    file_type character varying NOT NULL,
    file_size integer NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    chunk_count integer DEFAULT 0 NOT NULL,
    error_message text,
    metadata text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    source_type character varying,
    source_id character varying
);


--
-- Name: kb_inverted_index; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_inverted_index (
    id integer NOT NULL,
    term text NOT NULL,
    chunk_id text NOT NULL,
    knowledge_base_id text NOT NULL,
    term_frequency integer DEFAULT 1 NOT NULL,
    positions text
);


--
-- Name: kb_inverted_index_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kb_inverted_index_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kb_inverted_index_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kb_inverted_index_id_seq OWNED BY public.kb_inverted_index.id;


--
-- Name: kb_vectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_vectors (
    id uuid NOT NULL,
    chunk_id text NOT NULL,
    knowledge_base_id text NOT NULL,
    user_id text,
    embedding public.halfvec(8192) NOT NULL,
    model text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: knowledge_bases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_bases (
    user_id character varying,
    id character varying NOT NULL,
    name character varying NOT NULL,
    description text,
    embedding_model character varying NOT NULL,
    embedding_provider character varying NOT NULL,
    embedding_dimension integer DEFAULT 1536 NOT NULL,
    embedding_config text,
    document_count integer DEFAULT 0 NOT NULL,
    vector_count integer DEFAULT 0 NOT NULL,
    total_size integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: location_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_bindings (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    long_writing_location_id character varying,
    location_name character varying NOT NULL,
    image_paths text,
    thumbnail_path text,
    generate_config text,
    base_description text,
    style_reference text,
    additional_prompts text,
    time_of_day text,
    weather text,
    generate_images integer DEFAULT 0 NOT NULL,
    source_type text DEFAULT 'standalone'::text NOT NULL,
    override_name text,
    override_description text,
    standalone_name text,
    standalone_description text,
    panorama_3d_id text,
    scene_layout_id text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    location_type text,
    scale text,
    mood_tags text,
    style_anchors text,
    reference_image_path text
);


--
-- Name: lw_chapter_prewrites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_chapter_prewrites (
    user_id character varying,
    id character varying NOT NULL,
    outline_id character varying NOT NULL,
    content text,
    is_confirmed integer DEFAULT 0 NOT NULL,
    confirmed_at bigint,
    created_at bigint,
    updated_at bigint
);


--
-- Name: lw_chapter_state_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_chapter_state_summaries (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    outline_id character varying NOT NULL,
    chapter_number integer NOT NULL,
    story_time text NOT NULL,
    current_location text,
    character_states text,
    pending_events text,
    key_changes text,
    created_at bigint,
    updated_at bigint
);


--
-- Name: lw_chapter_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_chapter_versions (
    user_id character varying,
    id character varying NOT NULL,
    chapter_id character varying NOT NULL,
    content text NOT NULL,
    version_type text,
    word_count integer,
    is_locked integer DEFAULT 0 NOT NULL,
    version_number integer,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: lw_character_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_character_relations (
    user_id character varying,
    id character varying NOT NULL,
    character_id character varying NOT NULL,
    related_character_id character varying NOT NULL,
    relation_type text,
    relation_description text,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: lw_design_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_design_conversations (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    stage character varying NOT NULL,
    messages text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: lw_design_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_design_messages (
    user_id character varying,
    id character varying NOT NULL,
    conversation_id character varying NOT NULL,
    role character varying NOT NULL,
    content text NOT NULL,
    "timestamp" bigint NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: lw_dictionary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_dictionary (
    id character varying NOT NULL,
    category_code character varying NOT NULL,
    code character varying NOT NULL,
    name character varying NOT NULL,
    sort_order integer DEFAULT 0,
    created_at bigint,
    updated_at bigint
);


--
-- Name: lw_dictionary_category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_dictionary_category (
    id character varying NOT NULL,
    code character varying NOT NULL,
    name character varying NOT NULL,
    sort_order integer DEFAULT 0,
    created_at bigint,
    updated_at bigint
);


--
-- Name: lw_entity_state_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_entity_state_snapshots (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    entity_type character varying NOT NULL,
    entity_id character varying NOT NULL,
    entity_name character varying NOT NULL,
    chapter_number integer NOT NULL,
    state_summary text NOT NULL,
    key_changes text,
    created_at bigint,
    updated_at bigint
);


--
-- Name: lw_global_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_global_settings (
    id character varying NOT NULL,
    story_types text,
    styles text,
    target_readers text,
    skill_types text,
    skill_levels text,
    item_types text,
    item_levels text,
    estimated_lengths text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: lw_memory_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_memory_entities (
    user_id character varying,
    id character varying NOT NULL,
    memory_id character varying NOT NULL,
    entity_type character varying NOT NULL,
    entity_id character varying NOT NULL,
    entity_name character varying NOT NULL,
    created_at bigint
);


--
-- Name: lw_outline_characters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_outline_characters (
    user_id character varying,
    id character varying NOT NULL,
    outline_id character varying NOT NULL,
    character_id character varying NOT NULL,
    created_at bigint
);


--
-- Name: lw_outline_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_outline_items (
    user_id character varying,
    id character varying NOT NULL,
    outline_id character varying NOT NULL,
    item_id character varying NOT NULL,
    created_at bigint
);


--
-- Name: lw_outline_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_outline_locations (
    user_id character varying,
    id character varying NOT NULL,
    outline_id character varying NOT NULL,
    location_id character varying NOT NULL,
    created_at bigint
);


--
-- Name: lw_plot_characters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_plot_characters (
    user_id character varying,
    id character varying NOT NULL,
    plot_id character varying NOT NULL,
    character_id character varying NOT NULL,
    created_at bigint
);


--
-- Name: lw_plot_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_plot_locations (
    user_id character varying,
    id character varying NOT NULL,
    plot_id character varying NOT NULL,
    location_id character varying NOT NULL,
    created_at bigint
);


--
-- Name: lw_project_factions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_project_factions (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    faction_type character varying NOT NULL,
    name character varying NOT NULL,
    location_id text,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: lw_project_item_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_project_item_levels (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    item_type_code character varying NOT NULL,
    code character varying NOT NULL,
    name character varying NOT NULL,
    description text,
    sort_order integer DEFAULT 0,
    created_at bigint,
    updated_at bigint
);


--
-- Name: lw_project_item_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_project_item_types (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    code character varying NOT NULL,
    name character varying NOT NULL,
    description text,
    sort_order integer DEFAULT 0,
    created_at bigint,
    updated_at bigint
);


--
-- Name: lw_project_maps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_project_maps (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    name character varying NOT NULL,
    orientation text,
    characteristics text,
    image_path text,
    ai_generated_data text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: lw_project_model_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_project_model_configs (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    stage character varying NOT NULL,
    provider_config_id character varying NOT NULL,
    model_id character varying NOT NULL,
    created_at bigint,
    updated_at bigint
);


--
-- Name: lw_project_skill_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_project_skill_levels (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    skill_type_code character varying NOT NULL,
    code character varying NOT NULL,
    name character varying NOT NULL,
    description text,
    sort_order integer DEFAULT 0,
    created_at bigint,
    updated_at bigint
);


--
-- Name: lw_project_skill_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_project_skill_types (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    code character varying NOT NULL,
    name character varying NOT NULL,
    description text,
    sort_order integer DEFAULT 0,
    created_at bigint,
    updated_at bigint
);


--
-- Name: lw_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_projects (
    user_id character varying,
    id character varying NOT NULL,
    name character varying NOT NULL,
    type character varying NOT NULL,
    stage character varying NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: lw_skill_characters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_skill_characters (
    user_id character varying,
    id character varying NOT NULL,
    skill_id character varying NOT NULL,
    character_id character varying NOT NULL,
    created_at bigint
);


--
-- Name: lw_story_backgrounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_story_backgrounds (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    era_type text,
    era_description text,
    social_structure text,
    tech_level text,
    special_rules text,
    faction_distribution text,
    geographic_orientation text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: lw_story_chapters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_story_chapters (
    user_id character varying,
    id character varying NOT NULL,
    outline_id character varying NOT NULL,
    content text,
    word_count integer,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: lw_story_characters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_story_characters (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    name character varying NOT NULL,
    gender text,
    age integer,
    height integer,
    weight integer,
    race text,
    occupation text,
    "position" text,
    appearance text,
    background text,
    personality text,
    abilities text,
    role_position text,
    importance text DEFAULT 'secondary'::text NOT NULL,
    template_type text,
    major_events text,
    source_type text DEFAULT 'longwriting'::text,
    source_episode_id text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: lw_story_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_story_items (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    name character varying NOT NULL,
    type text,
    level text,
    description text,
    owner_id text,
    importance text DEFAULT 'secondary'::text,
    source_type text DEFAULT 'longwriting'::text,
    source_episode_id text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: lw_story_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_story_locations (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    name character varying NOT NULL,
    type text,
    description text,
    importance text,
    map_id text,
    entity_importance text DEFAULT 'secondary'::text,
    template_type text,
    source_type text DEFAULT 'longwriting'::text,
    source_episode_id text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: lw_story_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_story_materials (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    name character varying NOT NULL,
    type character varying,
    source text,
    content text,
    status character varying DEFAULT 'pending'::character varying,
    error_message text,
    retry_count integer DEFAULT 0,
    used integer DEFAULT 0,
    created_at bigint
);


--
-- Name: lw_story_memories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_story_memories (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    source_outline_id text,
    memory_type character varying NOT NULL,
    title character varying NOT NULL,
    description text,
    involved_entities text,
    chapter_number integer,
    importance text DEFAULT 'normal'::text NOT NULL,
    is_active integer DEFAULT 1 NOT NULL,
    created_at bigint,
    updated_at bigint
);


--
-- Name: lw_story_outlines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_story_outlines (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    parent_id text,
    name character varying NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    node_type text,
    summary text,
    involved_characters text,
    involved_locations text,
    involved_items text,
    status text DEFAULT 'pending'::text NOT NULL,
    estimated_words integer,
    order_index integer,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: lw_story_overviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_story_overviews (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    story_type text,
    title text,
    summary text,
    core_conflict text,
    theme text,
    estimated_chapters integer,
    is_locked integer DEFAULT 0 NOT NULL,
    core_idea text,
    style text,
    target_reader text,
    estimated_length text,
    other_requirements text,
    key_characters text,
    key_locations text,
    is_saved integer DEFAULT 0 NOT NULL,
    enabled_features text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: lw_story_plots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_story_plots (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    title character varying NOT NULL,
    summary text NOT NULL,
    plot_order integer DEFAULT 0 NOT NULL,
    involved_characters text,
    involved_locations text,
    notes text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: lw_story_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_story_skills (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    name character varying NOT NULL,
    type text,
    level text,
    description text,
    system text,
    character_ids text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: lw_temp_character_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_temp_character_templates (
    id character varying NOT NULL,
    type character varying NOT NULL,
    name character varying NOT NULL,
    gender character varying DEFAULT 'other'::character varying NOT NULL,
    age_min integer DEFAULT 20,
    age_max integer DEFAULT 50,
    base_prompt text NOT NULL,
    style_variants text,
    negative_prompt text,
    match_keywords text,
    sort_order integer DEFAULT 0,
    is_default integer DEFAULT 0,
    created_at bigint,
    updated_at bigint
);


--
-- Name: lw_temp_location_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lw_temp_location_templates (
    id character varying NOT NULL,
    type character varying NOT NULL,
    name character varying NOT NULL,
    base_prompt text NOT NULL,
    style_variants text,
    negative_prompt text,
    match_keywords text,
    sort_order integer DEFAULT 0,
    is_default integer DEFAULT 0,
    created_at bigint,
    updated_at bigint
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    user_id character varying,
    id character varying NOT NULL,
    dialog_id character varying NOT NULL,
    role character varying NOT NULL,
    content text NOT NULL,
    model_id text,
    tokens_used integer,
    attachments text,
    metadata text,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: oss_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oss_configs (
    id character varying NOT NULL,
    name character varying NOT NULL,
    provider character varying NOT NULL,
    access_key_id text NOT NULL,
    access_key_secret text NOT NULL,
    region character varying NOT NULL,
    bucket character varying NOT NULL,
    endpoint text,
    custom_domain text,
    path_prefix text,
    is_enabled integer DEFAULT 1 NOT NULL,
    is_default integer DEFAULT 0 NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);


--
-- Name: portrait_characters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portrait_characters (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    name character varying NOT NULL,
    gender character varying DEFAULT 'male'::character varying NOT NULL,
    age integer DEFAULT 25 NOT NULL,
    height integer DEFAULT 170 NOT NULL,
    weight integer DEFAULT 65 NOT NULL,
    race character varying DEFAULT 'asian'::character varying NOT NULL,
    description text,
    prompt text,
    reference_images text,
    provider_id text,
    model_id text,
    config text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: portrait_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portrait_projects (
    user_id character varying,
    id character varying NOT NULL,
    name character varying NOT NULL,
    description text,
    default_provider_id text,
    default_model_id text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: portrait_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portrait_variants (
    user_id character varying,
    id character varying NOT NULL,
    character_id character varying NOT NULL,
    type character varying NOT NULL,
    parent_id text,
    angle character varying NOT NULL,
    image_path text NOT NULL,
    prompt text NOT NULL,
    config text,
    variant_info text,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: provider_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_configs (
    id character varying NOT NULL,
    short_id text,
    template_id character varying NOT NULL,
    name character varying NOT NULL,
    api_key_encrypted text,
    access_key_id text,
    access_key_secret_encrypted text,
    base_url text,
    image_base_url text,
    video_base_url text,
    audio_base_url text,
    custom_headers text,
    custom_params text,
    models text,
    is_enabled integer DEFAULT 1 NOT NULL,
    is_default integer DEFAULT 0 NOT NULL,
    last_tested timestamp without time zone,
    test_result text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    user_id character varying,
    id character varying NOT NULL,
    name character varying NOT NULL,
    description text,
    system_prompt text,
    avatar text,
    is_builtin integer DEFAULT 0 NOT NULL,
    default_model_id text,
    default_provider_config_id text,
    auto_reset_model integer DEFAULT 1 NOT NULL,
    temperature real DEFAULT '0.7'::real NOT NULL,
    top_p real DEFAULT '1'::real NOT NULL,
    max_context_messages integer DEFAULT 20 NOT NULL,
    max_tokens integer DEFAULT 4096 NOT NULL,
    enable_stream integer DEFAULT 1 NOT NULL,
    custom_params text,
    knowledge_base_ids text,
    knowledge_retrieve_count integer DEFAULT 5 NOT NULL,
    knowledge_threshold real DEFAULT '0.5'::real NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: scene_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scene_actions (
    user_id character varying,
    id character varying NOT NULL,
    scene_script_id character varying NOT NULL,
    character_id text,
    description text NOT NULL,
    timing text DEFAULT 'during'::text NOT NULL,
    duration real,
    sort_order integer NOT NULL,
    character_binding_id character varying
);


--
-- Name: scene_characters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scene_characters (
    user_id character varying,
    id character varying NOT NULL,
    scene_script_id character varying NOT NULL,
    character_id character varying NOT NULL,
    character_name character varying NOT NULL,
    "position" text DEFAULT 'center'::text NOT NULL,
    expression text,
    action text,
    outfit text,
    sort_order integer DEFAULT 0 NOT NULL,
    character_binding_id character varying
);


--
-- Name: scene_dialogues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scene_dialogues (
    user_id character varying,
    id character varying NOT NULL,
    scene_script_id character varying NOT NULL,
    character_id character varying NOT NULL,
    character_name character varying NOT NULL,
    text text NOT NULL,
    emotion text,
    volume text DEFAULT 'normal'::text NOT NULL,
    pace text DEFAULT 'normal'::text NOT NULL,
    pause integer DEFAULT 0 NOT NULL,
    voice_id text,
    audio_asset_id text,
    sort_order integer NOT NULL,
    character_binding_id character varying
);


--
-- Name: scene_props; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scene_props (
    user_id character varying,
    id character varying NOT NULL,
    scene_character_id character varying NOT NULL,
    prop_name text NOT NULL,
    item_binding_id character varying
);


--
-- Name: scene_scripts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scene_scripts (
    user_id character varying,
    id character varying NOT NULL,
    episode_script_id character varying NOT NULL,
    scene_number integer NOT NULL,
    location text NOT NULL,
    location_type character varying DEFAULT 'exterior'::character varying NOT NULL,
    time_of_day character varying DEFAULT 'morning'::character varying NOT NULL,
    weather text,
    scene_description text NOT NULL,
    mood text,
    lighting text,
    characters text,
    original_text text,
    narration text,
    dialogues text,
    actions text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    location_binding_id character varying
);


--
-- Name: search_engine_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_engine_configs (
    id character varying NOT NULL,
    template_id character varying NOT NULL,
    name character varying NOT NULL,
    api_key_encrypted text,
    extra_config text,
    max_results integer DEFAULT 5 NOT NULL,
    is_enabled integer DEFAULT 1 NOT NULL,
    is_default integer DEFAULT 0 NOT NULL,
    last_tested timestamp without time zone,
    test_result text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    key character varying NOT NULL,
    value text NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: storyboard_characters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storyboard_characters (
    user_id character varying,
    id character varying NOT NULL,
    storyboard_id character varying NOT NULL,
    character_id character varying NOT NULL,
    position_x real DEFAULT '50'::real NOT NULL,
    position_y real DEFAULT '50'::real NOT NULL,
    position_scale real DEFAULT '1'::real NOT NULL,
    expression text,
    action text,
    facing text DEFAULT 'front'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: storyboard_keyframe; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storyboard_keyframe (
    id character varying NOT NULL,
    user_id character varying,
    storyboard_id character varying NOT NULL,
    frame_index integer NOT NULL,
    time_percent real DEFAULT '0'::real NOT NULL,
    frame_role character varying NOT NULL,
    image_asset_id character varying,
    derived_from_keyframe_id character varying,
    prompt text,
    negative_prompt text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone,
    user_prompt_override text,
    reference_overrides text
);


--
-- Name: storyboards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storyboards (
    user_id character varying,
    id character varying NOT NULL,
    scene_script_id character varying NOT NULL,
    shot_number integer NOT NULL,
    shot_type character varying DEFAULT 'medium'::character varying NOT NULL,
    camera_angle character varying DEFAULT 'eye_level'::character varying NOT NULL,
    camera_movement character varying DEFAULT 'static'::character varying NOT NULL,
    movement_duration real,
    frame_description text NOT NULL,
    subject text,
    composition text,
    characters text,
    narration_id text,
    dialogue_ids text,
    action_ids text,
    frame_image text,
    frame_image_id text,
    video_path text,
    duration real DEFAULT '3'::real NOT NULL,
    transition text NOT NULL,
    transition_type text,
    transition_duration_ms real,
    transition_direction text,
    transition_easing text,
    transition_color text,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    keyframe_count integer DEFAULT 2 NOT NULL,
    video_provider_id character varying,
    video_model_id character varying,
    video_mode character varying,
    use_3d_staging integer DEFAULT 0 NOT NULL,
    staging_layout_id character varying,
    background_ref_image_id character varying,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    use_keyframes integer DEFAULT 1 NOT NULL,
    include_in_final integer DEFAULT 1 NOT NULL,
    reference_image_ids text,
    location_binding_ids text,
    item_binding_ids text
);


--
-- Name: translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.translations (
    user_id character varying,
    id character varying NOT NULL,
    type character varying NOT NULL,
    source_language character varying NOT NULL,
    target_language character varying NOT NULL,
    source_text text,
    target_text text,
    source_file text,
    source_file_name text,
    target_file text,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    favorite integer DEFAULT 0 NOT NULL,
    word_count integer DEFAULT 0 NOT NULL,
    provider_id text,
    model_id text,
    error_message text,
    created_at text NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying NOT NULL,
    email character varying NOT NULL,
    display_name character varying,
    password_hash character varying,
    role character varying DEFAULT 'user'::character varying NOT NULL,
    is_active integer DEFAULT 1 NOT NULL,
    created_at bigint,
    last_login_at bigint
);


--
-- Name: video_episodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_episodes (
    user_id character varying,
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    source_type character varying DEFAULT 'outline'::character varying NOT NULL,
    outline_id text,
    uploaded_content text,
    uploaded_characters text,
    episode_number integer NOT NULL,
    title character varying NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    duration integer DEFAULT 0 NOT NULL,
    script_id text,
    audio_tracks text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    deleted_at timestamp without time zone,
    uploaded_locations text,
    uploaded_items text,
    story_era text,
    story_region text,
    story_background_extra text
);


--
-- Name: video_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_projects (
    user_id character varying,
    id character varying NOT NULL,
    name character varying NOT NULL,
    long_writing_project_id text,
    status character varying DEFAULT 'draft'::character varying NOT NULL,
    config text NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: voice_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_records (
    user_id character varying,
    id character varying NOT NULL,
    type character varying NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    input_text text,
    output_audio_path text,
    voice_id text,
    voice_name text,
    language text,
    speed real DEFAULT '1'::real NOT NULL,
    pitch real DEFAULT '0'::real NOT NULL,
    volume real DEFAULT '1'::real NOT NULL,
    emotion text,
    style text,
    duration integer,
    input_audio_path text,
    output_text text,
    provider_id text,
    model_id text,
    favorite integer DEFAULT 0 NOT NULL,
    error_message text,
    created_at text NOT NULL
);


--
-- Name: kb_inverted_index id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_inverted_index ALTER COLUMN id SET DEFAULT nextval('public.kb_inverted_index_id_seq'::regclass);


--
-- Name: provider_configs PK_00bf1b21735102954736b29cdb8; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_configs
    ADD CONSTRAINT "PK_00bf1b21735102954736b29cdb8" PRIMARY KEY (id);


--
-- Name: cloned_voices PK_05c524bc435b234bd69fd698986; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cloned_voices
    ADD CONSTRAINT "PK_05c524bc435b234bd69fd698986" PRIMARY KEY (id);


--
-- Name: lw_story_skills PK_09eb77c1cdbd4271d0665d27a43; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_story_skills
    ADD CONSTRAINT "PK_09eb77c1cdbd4271d0665d27a43" PRIMARY KEY (id);


--
-- Name: scene_characters PK_0c954c4d375d818c7c44cbe7365; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scene_characters
    ADD CONSTRAINT "PK_0c954c4d375d818c7c44cbe7365" PRIMARY KEY (id);


--
-- Name: lw_story_memories PK_11ff80815fbdd8b7faeded5e833; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_story_memories
    ADD CONSTRAINT "PK_11ff80815fbdd8b7faeded5e833" PRIMARY KEY (id);


--
-- Name: kb_documents PK_14ad41415f09ecb8f042d78422a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_documents
    ADD CONSTRAINT "PK_14ad41415f09ecb8f042d78422a" PRIMARY KEY (id);


--
-- Name: messages PK_18325f38ae6de43878487eff986; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY (id);


--
-- Name: voice_records PK_1f7d2e5034b756740507a6eb77b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_records
    ADD CONSTRAINT "PK_1f7d2e5034b756740507a6eb77b" PRIMARY KEY (id);


--
-- Name: lw_project_model_configs PK_1f936a390355634433bb97b1799; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_project_model_configs
    ADD CONSTRAINT "PK_1f936a390355634433bb97b1799" PRIMARY KEY (id);


--
-- Name: images PK_1fe148074c6a1a91b63cb9ee3c9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.images
    ADD CONSTRAINT "PK_1fe148074c6a1a91b63cb9ee3c9" PRIMARY KEY (id);


--
-- Name: portrait_projects PK_211493a0a27651dc69263ca46ad; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portrait_projects
    ADD CONSTRAINT "PK_211493a0a27651dc69263ca46ad" PRIMARY KEY (id);


--
-- Name: lw_global_settings PK_2286977bc9c52306a780e93362a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_global_settings
    ADD CONSTRAINT "PK_2286977bc9c52306a780e93362a" PRIMARY KEY (id);


--
-- Name: lw_story_characters PK_2e67527db118330cef12f90dd42; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_story_characters
    ADD CONSTRAINT "PK_2e67527db118330cef12f90dd42" PRIMARY KEY (id);


--
-- Name: lw_dictionary PK_2eb408269b49246463ae13742fd; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_dictionary
    ADD CONSTRAINT "PK_2eb408269b49246463ae13742fd" PRIMARY KEY (id);


--
-- Name: lw_chapter_versions PK_30dcfc52ec77ecba91321b285ae; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_chapter_versions
    ADD CONSTRAINT "PK_30dcfc52ec77ecba91321b285ae" PRIMARY KEY (id);


--
-- Name: portrait_variants PK_331c84071832f7f56f20c37df9b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portrait_variants
    ADD CONSTRAINT "PK_331c84071832f7f56f20c37df9b" PRIMARY KEY (id);


--
-- Name: lw_story_items PK_36fce3d5ea3bc84cb9b94668568; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_story_items
    ADD CONSTRAINT "PK_36fce3d5ea3bc84cb9b94668568" PRIMARY KEY (id);


--
-- Name: lw_project_skill_types PK_37270ab99becd4a207181c228a9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_project_skill_types
    ADD CONSTRAINT "PK_37270ab99becd4a207181c228a9" PRIMARY KEY (id);


--
-- Name: portrait_characters PK_372f4e29df7853aabaa55a97686; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portrait_characters
    ADD CONSTRAINT "PK_372f4e29df7853aabaa55a97686" PRIMARY KEY (id);


--
-- Name: lw_plot_characters PK_38dd09089550a5d1441c9d6f96e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_plot_characters
    ADD CONSTRAINT "PK_38dd09089550a5d1441c9d6f96e" PRIMARY KEY (id);


--
-- Name: lw_story_outlines PK_3bc696405c97cd3fa15977cc46d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_story_outlines
    ADD CONSTRAINT "PK_3bc696405c97cd3fa15977cc46d" PRIMARY KEY (id);


--
-- Name: lw_story_overviews PK_3cfd05fd632e5a4d2eb00a1aba5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_story_overviews
    ADD CONSTRAINT "PK_3cfd05fd632e5a4d2eb00a1aba5" PRIMARY KEY (id);


--
-- Name: diary_entries PK_45cc0613be17fab8a954db677a0; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diary_entries
    ADD CONSTRAINT "PK_45cc0613be17fab8a954db677a0" PRIMARY KEY (id);


--
-- Name: lw_skill_characters PK_47040da14084af117fd9a97a589; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_skill_characters
    ADD CONSTRAINT "PK_47040da14084af117fd9a97a589" PRIMARY KEY (id);


--
-- Name: lw_dictionary_category PK_49f246cc5900f0b0b19249449e2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_dictionary_category
    ADD CONSTRAINT "PK_49f246cc5900f0b0b19249449e2" PRIMARY KEY (id);


--
-- Name: scene_props PK_4ad52835f8f16a10d970f093ecc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scene_props
    ADD CONSTRAINT "PK_4ad52835f8f16a10d970f093ecc" PRIMARY KEY (id);


--
-- Name: scene_scripts PK_4ed6d2314086cbf0ae2b9231b40; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scene_scripts
    ADD CONSTRAINT "PK_4ed6d2314086cbf0ae2b9231b40" PRIMARY KEY (id);


--
-- Name: lw_chapter_prewrites PK_539b0b71cdff20d02060a07dafb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_chapter_prewrites
    ADD CONSTRAINT "PK_539b0b71cdff20d02060a07dafb" PRIMARY KEY (id);


--
-- Name: diary_attachments PK_53a2c53c4f5e0fbf644d7179dc5; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diary_attachments
    ADD CONSTRAINT "PK_53a2c53c4f5e0fbf644d7179dc5" PRIMARY KEY (id);


--
-- Name: lw_design_messages PK_58b212f05da7acdf933e1625cfe; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_design_messages
    ADD CONSTRAINT "PK_58b212f05da7acdf933e1625cfe" PRIMARY KEY (id);


--
-- Name: lw_design_conversations PK_5afb867e88e2507424ef66a58a2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_design_conversations
    ADD CONSTRAINT "PK_5afb867e88e2507424ef66a58a2" PRIMARY KEY (id);


--
-- Name: item_bindings PK_5d84bf0d7f0df3c2d088a4c60e6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_bindings
    ADD CONSTRAINT "PK_5d84bf0d7f0df3c2d088a4c60e6" PRIMARY KEY (id);


--
-- Name: scene_actions PK_5debc3e39279de37edc923ff801; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scene_actions
    ADD CONSTRAINT "PK_5debc3e39279de37edc923ff801" PRIMARY KEY (id);


--
-- Name: lw_project_item_types PK_68301aff6950074e88ba2b67919; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_project_item_types
    ADD CONSTRAINT "PK_68301aff6950074e88ba2b67919" PRIMARY KEY (id);


--
-- Name: image_assets PK_68a641039393a26cc181632b040; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_assets
    ADD CONSTRAINT "PK_68a641039393a26cc181632b040" PRIMARY KEY (id);


--
-- Name: lw_outline_locations PK_696490dc33ce66720b17f64715f; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_outline_locations
    ADD CONSTRAINT "PK_696490dc33ce66720b17f64715f" PRIMARY KEY (id);


--
-- Name: diary_folders PK_6a07d9c5532c585af2ee79fb884; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diary_folders
    ADD CONSTRAINT "PK_6a07d9c5532c585af2ee79fb884" PRIMARY KEY (id);


--
-- Name: storyboards PK_6c841a5aa655249cf5fc21c6273; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storyboards
    ADD CONSTRAINT "PK_6c841a5aa655249cf5fc21c6273" PRIMARY KEY (id);


--
-- Name: lw_projects PK_6f4ce62807d6ba86e9346691ddc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_projects
    ADD CONSTRAINT "PK_6f4ce62807d6ba86e9346691ddc" PRIMARY KEY (id);


--
-- Name: lw_entity_state_snapshots PK_7219394fbfbaa7d7c497eb47c5a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_entity_state_snapshots
    ADD CONSTRAINT "PK_7219394fbfbaa7d7c497eb47c5a" PRIMARY KEY (id);


--
-- Name: character_bindings PK_74f2f8f94bbebc47d6675cb1154; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_bindings
    ADD CONSTRAINT "PK_74f2f8f94bbebc47d6675cb1154" PRIMARY KEY (id);


--
-- Name: dialogs PK_75ffe676a97ca2eb5510ec88b11; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dialogs
    ADD CONSTRAINT "PK_75ffe676a97ca2eb5510ec88b11" PRIMARY KEY (id);


--
-- Name: lw_story_locations PK_79405f04f13083a4a3ae0c46aed; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_story_locations
    ADD CONSTRAINT "PK_79405f04f13083a4a3ae0c46aed" PRIMARY KEY (id);


--
-- Name: lw_project_item_levels PK_7b46ad79e8e14994b4776739536; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_project_item_levels
    ADD CONSTRAINT "PK_7b46ad79e8e14994b4776739536" PRIMARY KEY (id);


--
-- Name: lw_outline_items PK_80d3afd434836463239c3ceb96d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_outline_items
    ADD CONSTRAINT "PK_80d3afd434836463239c3ceb96d" PRIMARY KEY (id);


--
-- Name: lw_temp_location_templates PK_8ad009875f0c59589b422b2d7f9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_temp_location_templates
    ADD CONSTRAINT "PK_8ad009875f0c59589b422b2d7f9" PRIMARY KEY (id);


--
-- Name: asset_image PK_8ecac446866817d842c4e928ba0; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_image
    ADD CONSTRAINT "PK_8ecac446866817d842c4e928ba0" PRIMARY KEY (id);


--
-- Name: lw_story_backgrounds PK_8f0f129df10fd447f2b9d580467; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_story_backgrounds
    ADD CONSTRAINT "PK_8f0f129df10fd447f2b9d580467" PRIMARY KEY (id);


--
-- Name: lw_chapter_state_summaries PK_9016c094b9416ecf54350eedb22; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_chapter_state_summaries
    ADD CONSTRAINT "PK_9016c094b9416ecf54350eedb22" PRIMARY KEY (id);


--
-- Name: lw_story_chapters PK_9269e7bdfde3274d2f7070406ba; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_story_chapters
    ADD CONSTRAINT "PK_9269e7bdfde3274d2f7070406ba" PRIMARY KEY (id);


--
-- Name: episode_scripts PK_93eb8737cae765d9dacebb9da2d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.episode_scripts
    ADD CONSTRAINT "PK_93eb8737cae765d9dacebb9da2d" PRIMARY KEY (id);


--
-- Name: lw_project_maps PK_96ae17cfdb04633883822628543; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_project_maps
    ADD CONSTRAINT "PK_96ae17cfdb04633883822628543" PRIMARY KEY (id);


--
-- Name: lw_outline_characters PK_9a3dba00f54465c6d6c2f74b8ad; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_outline_characters
    ADD CONSTRAINT "PK_9a3dba00f54465c6d6c2f74b8ad" PRIMARY KEY (id);


--
-- Name: video_episodes PK_a016c6a76dc522ddb75be5b6885; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_episodes
    ADD CONSTRAINT "PK_a016c6a76dc522ddb75be5b6885" PRIMARY KEY (id);


--
-- Name: users PK_a3ffb1c0c8416b9fc6f907b7433; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);


--
-- Name: lw_project_skill_levels PK_a9ed4f23624ec6960e47bcd595e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_project_skill_levels
    ADD CONSTRAINT "PK_a9ed4f23624ec6960e47bcd595e" PRIMARY KEY (id);


--
-- Name: translations PK_aca248c72ae1fb2390f1bf4cd87; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.translations
    ADD CONSTRAINT "PK_aca248c72ae1fb2390f1bf4cd87" PRIMARY KEY (id);


--
-- Name: location_bindings PK_ada3f2df508162a86b0815f6dda; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_bindings
    ADD CONSTRAINT "PK_ada3f2df508162a86b0815f6dda" PRIMARY KEY (id);


--
-- Name: lw_story_materials PK_adc92c49385c1b69534b746e71d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_story_materials
    ADD CONSTRAINT "PK_adc92c49385c1b69534b746e71d" PRIMARY KEY (id);


--
-- Name: search_engine_configs PK_aea5420f148e778062a37a4adfb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_engine_configs
    ADD CONSTRAINT "PK_aea5420f148e778062a37a4adfb" PRIMARY KEY (id);


--
-- Name: lw_story_plots PK_b32f46345ac2e020b6bba96dc50; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_story_plots
    ADD CONSTRAINT "PK_b32f46345ac2e020b6bba96dc50" PRIMARY KEY (id);


--
-- Name: scene_dialogues PK_b69e12d3b5916fe0774a6130ec7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scene_dialogues
    ADD CONSTRAINT "PK_b69e12d3b5916fe0774a6130ec7" PRIMARY KEY (id);


--
-- Name: knowledge_bases PK_b7da0ee578e15ebb6213465440d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_bases
    ADD CONSTRAINT "PK_b7da0ee578e15ebb6213465440d" PRIMARY KEY (id);


--
-- Name: lw_project_factions PK_bd2ff17e4b4f6ca3c07445a5e88; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_project_factions
    ADD CONSTRAINT "PK_bd2ff17e4b4f6ca3c07445a5e88" PRIMARY KEY (id);


--
-- Name: lw_memory_entities PK_be2bb3aff08207f7cf7e92bc8b3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_memory_entities
    ADD CONSTRAINT "PK_be2bb3aff08207f7cf7e92bc8b3" PRIMARY KEY (id);


--
-- Name: api_keys PK_bf4f4224172f0923bbaf8affdb2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT "PK_bf4f4224172f0923bbaf8affdb2" PRIMARY KEY (provider);


--
-- Name: roles PK_c1433d71a4838793a49dcad46ab; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY (id);


--
-- Name: video_projects PK_c65cf7edd7fd291ac7be1f2ee4b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_projects
    ADD CONSTRAINT "PK_c65cf7edd7fd291ac7be1f2ee4b" PRIMARY KEY (id);


--
-- Name: settings PK_c8639b7626fa94ba8265628f214; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT "PK_c8639b7626fa94ba8265628f214" PRIMARY KEY (key);


--
-- Name: storyboard_keyframe PK_c98c6c148b67cf5cc73e04e4bf6; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storyboard_keyframe
    ADD CONSTRAINT "PK_c98c6c148b67cf5cc73e04e4bf6" PRIMARY KEY (id);


--
-- Name: kb_chunks PK_de84c3fce0c1a29928e98441cd3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_chunks
    ADD CONSTRAINT "PK_de84c3fce0c1a29928e98441cd3" PRIMARY KEY (id);


--
-- Name: diary_links PK_df5858da10a6a54dd8050738451; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diary_links
    ADD CONSTRAINT "PK_df5858da10a6a54dd8050738451" PRIMARY KEY (id);


--
-- Name: lw_temp_character_templates PK_e34a4c3b83df32ef9b9b60fb995; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_temp_character_templates
    ADD CONSTRAINT "PK_e34a4c3b83df32ef9b9b60fb995" PRIMARY KEY (id);


--
-- Name: kb_inverted_index PK_e458a7acc66e1061dc75b947dcb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_inverted_index
    ADD CONSTRAINT "PK_e458a7acc66e1061dc75b947dcb" PRIMARY KEY (id);


--
-- Name: lw_plot_locations PK_e67d909c0523abe419461e69fe4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_plot_locations
    ADD CONSTRAINT "PK_e67d909c0523abe419461e69fe4" PRIMARY KEY (id);


--
-- Name: oss_configs PK_e984a062225733f57c1bcb987dc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oss_configs
    ADD CONSTRAINT "PK_e984a062225733f57c1bcb987dc" PRIMARY KEY (id);


--
-- Name: storyboard_characters PK_f13d02d7bda8c27524dec707c92; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storyboard_characters
    ADD CONSTRAINT "PK_f13d02d7bda8c27524dec707c92" PRIMARY KEY (id);


--
-- Name: lw_character_relations PK_f670d50c1126761013233f9fb74; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_character_relations
    ADD CONSTRAINT "PK_f670d50c1126761013233f9fb74" PRIMARY KEY (id);


--
-- Name: lw_temp_character_templates UQ_a50e8648736e0bd3f533b4e09b0; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_temp_character_templates
    ADD CONSTRAINT "UQ_a50e8648736e0bd3f533b4e09b0" UNIQUE (type);


--
-- Name: lw_dictionary_category UQ_af09483e00d0e41907f5401f730; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_dictionary_category
    ADD CONSTRAINT "UQ_af09483e00d0e41907f5401f730" UNIQUE (code);


--
-- Name: lw_temp_location_templates UQ_ff6e75548697f004b410296bf9b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_temp_location_templates
    ADD CONSTRAINT "UQ_ff6e75548697f004b410296bf9b" UNIQUE (type);


--
-- Name: kb_inverted_index idx_kb_inverted_index_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_inverted_index
    ADD CONSTRAINT idx_kb_inverted_index_unique UNIQUE (term, chunk_id);


--
-- Name: lw_entity_state_snapshots idx_lw_entity_snapshots_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_entity_state_snapshots
    ADD CONSTRAINT idx_lw_entity_snapshots_unique UNIQUE (project_id, entity_type, entity_id, chapter_number);


--
-- Name: kb_vectors kb_vectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_vectors
    ADD CONSTRAINT kb_vectors_pkey PRIMARY KEY (id);


--
-- Name: item_bindings uq_item_bindings_project_lw; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_bindings
    ADD CONSTRAINT uq_item_bindings_project_lw UNIQUE (project_id, long_writing_item_id);


--
-- Name: location_bindings uq_location_bindings_project_lw; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_bindings
    ADD CONSTRAINT uq_location_bindings_project_lw UNIQUE (project_id, long_writing_location_id);


--
-- Name: lw_chapter_prewrites uq_lw_chapter_prewrites_outline; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_chapter_prewrites
    ADD CONSTRAINT uq_lw_chapter_prewrites_outline UNIQUE (outline_id);


--
-- Name: lw_chapter_state_summaries uq_lw_chapter_summaries_outline; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_chapter_state_summaries
    ADD CONSTRAINT uq_lw_chapter_summaries_outline UNIQUE (project_id, outline_id);


--
-- Name: lw_dictionary uq_lw_dictionary_cat_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_dictionary
    ADD CONSTRAINT uq_lw_dictionary_cat_code UNIQUE (category_code, code);


--
-- Name: lw_memory_entities uq_lw_memory_entities; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_memory_entities
    ADD CONSTRAINT uq_lw_memory_entities UNIQUE (memory_id, entity_type, entity_id);


--
-- Name: lw_outline_characters uq_lw_outline_characters; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_outline_characters
    ADD CONSTRAINT uq_lw_outline_characters UNIQUE (outline_id, character_id);


--
-- Name: lw_outline_items uq_lw_outline_items; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_outline_items
    ADD CONSTRAINT uq_lw_outline_items UNIQUE (outline_id, item_id);


--
-- Name: lw_outline_locations uq_lw_outline_locations; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_outline_locations
    ADD CONSTRAINT uq_lw_outline_locations UNIQUE (outline_id, location_id);


--
-- Name: lw_plot_characters uq_lw_plot_characters; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_plot_characters
    ADD CONSTRAINT uq_lw_plot_characters UNIQUE (plot_id, character_id);


--
-- Name: lw_plot_locations uq_lw_plot_locations; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_plot_locations
    ADD CONSTRAINT uq_lw_plot_locations UNIQUE (plot_id, location_id);


--
-- Name: lw_project_item_levels uq_lw_project_item_levels; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_project_item_levels
    ADD CONSTRAINT uq_lw_project_item_levels UNIQUE (project_id, item_type_code, code);


--
-- Name: lw_project_item_types uq_lw_project_item_types; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_project_item_types
    ADD CONSTRAINT uq_lw_project_item_types UNIQUE (project_id, code);


--
-- Name: lw_project_model_configs uq_lw_project_model_configs; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_project_model_configs
    ADD CONSTRAINT uq_lw_project_model_configs UNIQUE (project_id, stage);


--
-- Name: lw_project_skill_levels uq_lw_project_skill_levels; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_project_skill_levels
    ADD CONSTRAINT uq_lw_project_skill_levels UNIQUE (project_id, skill_type_code, code);


--
-- Name: lw_project_skill_types uq_lw_project_skill_types; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_project_skill_types
    ADD CONSTRAINT uq_lw_project_skill_types UNIQUE (project_id, code);


--
-- Name: lw_skill_characters uq_lw_skill_characters; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lw_skill_characters
    ADD CONSTRAINT uq_lw_skill_characters UNIQUE (skill_id, character_id);


--
-- Name: IDX_07f68f45ecd4d165a1b6c04e45; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_07f68f45ecd4d165a1b6c04e45" ON public.lw_project_item_types USING btree (user_id);


--
-- Name: IDX_08606933cc9e60e892fb6bdc32; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_08606933cc9e60e892fb6bdc32" ON public.lw_project_factions USING btree (user_id);


--
-- Name: IDX_08e0aa3222dfb7e213f57b33b1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_08e0aa3222dfb7e213f57b33b1" ON public.lw_story_memories USING btree (user_id);


--
-- Name: IDX_10c215b5a8ed3a2fa0e5f0ccea; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_10c215b5a8ed3a2fa0e5f0ccea" ON public.lw_memory_entities USING btree (user_id);


--
-- Name: IDX_1d6f7b1292a97ea3af883ca3c3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_1d6f7b1292a97ea3af883ca3c3" ON public.lw_plot_characters USING btree (user_id);


--
-- Name: IDX_20911738b482e0675bcc092b3a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_20911738b482e0675bcc092b3a" ON public.lw_story_plots USING btree (user_id);


--
-- Name: IDX_236af4a2a75d34985e69c2e184; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_236af4a2a75d34985e69c2e184" ON public.lw_story_characters USING btree (user_id);


--
-- Name: IDX_2408f57d906e099d2425476fd4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_2408f57d906e099d2425476fd4" ON public.lw_chapter_prewrites USING btree (user_id);


--
-- Name: IDX_2598311d7aefa9d6bde7c488aa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_2598311d7aefa9d6bde7c488aa" ON public.item_bindings USING btree (user_id);


--
-- Name: IDX_2655dcf14f26f85239d900967e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_2655dcf14f26f85239d900967e" ON public.location_bindings USING btree (user_id);


--
-- Name: IDX_27855d322b4be48746c33a004e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_27855d322b4be48746c33a004e" ON public.scene_scripts USING btree (user_id);


--
-- Name: IDX_2cfa87ef8967943d434c5c820c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_2cfa87ef8967943d434c5c820c" ON public.diary_folders USING btree (user_id);


--
-- Name: IDX_39393b604672690e5f7f961f15; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_39393b604672690e5f7f961f15" ON public.scene_characters USING btree (user_id);


--
-- Name: IDX_3950e26e97315be41bfbb9bcaa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_3950e26e97315be41bfbb9bcaa" ON public.video_projects USING btree (user_id);


--
-- Name: IDX_3ac47b40cce8717c633d4838de; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_3ac47b40cce8717c633d4838de" ON public.lw_skill_characters USING btree (user_id);


--
-- Name: IDX_3bf65d46d3e7debf59593d7c15; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_3bf65d46d3e7debf59593d7c15" ON public.lw_projects USING btree (user_id);


--
-- Name: IDX_3d2aaf2b3388f503f1e3385631; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_3d2aaf2b3388f503f1e3385631" ON public.lw_story_chapters USING btree (user_id);


--
-- Name: IDX_3d9ab71d679871c89d4ce337b9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_3d9ab71d679871c89d4ce337b9" ON public.lw_story_overviews USING btree (user_id);


--
-- Name: IDX_4337ed311db79a938751af4f84; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4337ed311db79a938751af4f84" ON public.portrait_characters USING btree (user_id);


--
-- Name: IDX_4c6e846dee1b8318b73fd2ff87; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4c6e846dee1b8318b73fd2ff87" ON public.lw_project_item_levels USING btree (user_id);


--
-- Name: IDX_4ce3bf3796d9206e10e3a65304; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4ce3bf3796d9206e10e3a65304" ON public.kb_documents USING btree (user_id);


--
-- Name: IDX_4e7e7932f4f5ecedf9a8fac94b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_4e7e7932f4f5ecedf9a8fac94b" ON public.diary_links USING btree (user_id);


--
-- Name: IDX_52757a3abad650ffd3e157d333; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_52757a3abad650ffd3e157d333" ON public.character_bindings USING btree (user_id);


--
-- Name: IDX_5786e0b1282a3bc3a519f9b22d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_5786e0b1282a3bc3a519f9b22d" ON public.scene_props USING btree (user_id);


--
-- Name: IDX_579f1c1daf5b3f48e6fd86809c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_579f1c1daf5b3f48e6fd86809c" ON public.portrait_variants USING btree (user_id);


--
-- Name: IDX_5f0157932d1363289ec973e268; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_5f0157932d1363289ec973e268" ON public.dialogs USING btree (user_id);


--
-- Name: IDX_623fb05d9e3767aa7eba977225; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_623fb05d9e3767aa7eba977225" ON public.video_episodes USING btree (user_id);


--
-- Name: IDX_627a1ee1b03affdbd9d795e255; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_627a1ee1b03affdbd9d795e255" ON public.scene_dialogues USING btree (user_id);


--
-- Name: IDX_6985813dfcd1734bb49a3d2def; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_6985813dfcd1734bb49a3d2def" ON public.lw_character_relations USING btree (user_id);


--
-- Name: IDX_6f51ab0ca9262fe8005aa528d2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_6f51ab0ca9262fe8005aa528d2" ON public.lw_story_backgrounds USING btree (user_id);


--
-- Name: IDX_76d4790b6d146445e927d247fc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_76d4790b6d146445e927d247fc" ON public.lw_design_messages USING btree (user_id);


--
-- Name: IDX_770a0a7a2e2bf841144f74ea02; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_770a0a7a2e2bf841144f74ea02" ON public.lw_story_skills USING btree (user_id);


--
-- Name: IDX_7b6de5c1bef62aac8539562c94; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_7b6de5c1bef62aac8539562c94" ON public.lw_story_items USING btree (user_id);


--
-- Name: IDX_830a3c1d92614d1495418c4673; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_830a3c1d92614d1495418c4673" ON public.messages USING btree (user_id);


--
-- Name: IDX_8abcdb59ddc159f37cc6cfbfc3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_8abcdb59ddc159f37cc6cfbfc3" ON public.lw_story_locations USING btree (user_id);


--
-- Name: IDX_8f65155a715ab03d91327d7e98; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_8f65155a715ab03d91327d7e98" ON public.cloned_voices USING btree (user_id);


--
-- Name: IDX_9f840db6920af1111089b8d5d2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_9f840db6920af1111089b8d5d2" ON public.scene_actions USING btree (user_id);


--
-- Name: IDX_a022496ef4b9dbc8d53951584b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a022496ef4b9dbc8d53951584b" ON public.storyboard_characters USING btree (user_id);


--
-- Name: IDX_a51e72ad6416489961c1468a33; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a51e72ad6416489961c1468a33" ON public.lw_chapter_state_summaries USING btree (user_id);


--
-- Name: IDX_a969861629af37cd1c7f4ff3e6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_a969861629af37cd1c7f4ff3e6" ON public.roles USING btree (user_id);


--
-- Name: IDX_ab9c2dc2f656ee06b297bba4ca; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ab9c2dc2f656ee06b297bba4ca" ON public.translations USING btree (user_id);


--
-- Name: IDX_b437a65ead2702c9e6d85138da; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b437a65ead2702c9e6d85138da" ON public.lw_outline_locations USING btree (user_id);


--
-- Name: IDX_b5e009e6c8a46d7c7ad5684f69; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b5e009e6c8a46d7c7ad5684f69" ON public.kb_chunks USING btree (user_id);


--
-- Name: IDX_b83b4aa262ac2902d371391506; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b83b4aa262ac2902d371391506" ON public.lw_outline_characters USING btree (user_id);


--
-- Name: IDX_b9037ddc953c6455376ff5aff0; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_b9037ddc953c6455376ff5aff0" ON public.lw_project_skill_types USING btree (user_id);


--
-- Name: IDX_bb5bb41d2c362d852c8681edaa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_bb5bb41d2c362d852c8681edaa" ON public.lw_entity_state_snapshots USING btree (user_id);


--
-- Name: IDX_c112f699d6ffec0ec4ccf8afec; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c112f699d6ffec0ec4ccf8afec" ON public.lw_project_model_configs USING btree (user_id);


--
-- Name: IDX_c326c1e0235af04dbf4708b33b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c326c1e0235af04dbf4708b33b" ON public.lw_project_skill_levels USING btree (user_id);


--
-- Name: IDX_c76953b95c282198d818572c31; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c76953b95c282198d818572c31" ON public.lw_chapter_versions USING btree (user_id);


--
-- Name: IDX_ca1107a23014416d01575ce153; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ca1107a23014416d01575ce153" ON public.lw_project_maps USING btree (user_id);


--
-- Name: IDX_ccdf270f844ccab1384c387642; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ccdf270f844ccab1384c387642" ON public.lw_story_outlines USING btree (user_id);


--
-- Name: IDX_cd08a76c4ef63dd280637ba9b1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cd08a76c4ef63dd280637ba9b1" ON public.lw_outline_items USING btree (user_id);


--
-- Name: IDX_d0702071f5a2490922d1b2156c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d0702071f5a2490922d1b2156c" ON public.diary_entries USING btree (user_id);


--
-- Name: IDX_d441c96774812f5d6fdf54de59; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_d441c96774812f5d6fdf54de59" ON public.lw_design_conversations USING btree (user_id);


--
-- Name: IDX_dc945c0745a5ad4dba8dea6c8f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_dc945c0745a5ad4dba8dea6c8f" ON public.image_assets USING btree (user_id);


--
-- Name: IDX_decdf86f650fb765dac7bd091a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_decdf86f650fb765dac7bd091a" ON public.images USING btree (user_id);


--
-- Name: IDX_e9e0e292b437433e4f1b3187a6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_e9e0e292b437433e4f1b3187a6" ON public.storyboards USING btree (user_id);


--
-- Name: IDX_edc54b9d733c6f5f3d8fae9d9f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_edc54b9d733c6f5f3d8fae9d9f" ON public.diary_attachments USING btree (user_id);


--
-- Name: IDX_ef1e47a47b1b3cc7101e3607d9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ef1e47a47b1b3cc7101e3607d9" ON public.episode_scripts USING btree (user_id);


--
-- Name: IDX_ef87ed584851419fc15bb8660f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_ef87ed584851419fc15bb8660f" ON public.voice_records USING btree (user_id);


--
-- Name: IDX_f0c58d892c740be50a5ea9a268; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f0c58d892c740be50a5ea9a268" ON public.portrait_projects USING btree (user_id);


--
-- Name: IDX_f33d4d89429c66edd8b2b0994c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f33d4d89429c66edd8b2b0994c" ON public.lw_story_materials USING btree (user_id);


--
-- Name: IDX_f655b5782baf5d3d2b0ef5f459; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f655b5782baf5d3d2b0ef5f459" ON public.knowledge_bases USING btree (user_id);


--
-- Name: IDX_fbfac5555724812d274730149a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_fbfac5555724812d274730149a" ON public.lw_plot_locations USING btree (user_id);


--
-- Name: idx_asset_image_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_image_asset ON public.asset_image USING btree (asset_type, asset_id);


--
-- Name: idx_asset_image_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_image_user_id ON public.asset_image USING btree (user_id);


--
-- Name: idx_character_bindings_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_bindings_project_id ON public.character_bindings USING btree (project_id);


--
-- Name: idx_cloned_voices_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cloned_voices_created_at ON public.cloned_voices USING btree (created_at);


--
-- Name: idx_cloned_voices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cloned_voices_status ON public.cloned_voices USING btree (status);


--
-- Name: idx_diary_entries_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diary_entries_created ON public.diary_entries USING btree (created_at);


--
-- Name: idx_diary_entries_folder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diary_entries_folder ON public.diary_entries USING btree (folder_id);


--
-- Name: idx_diary_folders_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diary_folders_parent ON public.diary_folders USING btree (parent_id);


--
-- Name: idx_diary_links_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diary_links_source ON public.diary_links USING btree (source_entry_id);


--
-- Name: idx_episode_scripts_episode_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_episode_scripts_episode_id ON public.episode_scripts USING btree (episode_id);


--
-- Name: idx_episode_scripts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_episode_scripts_status ON public.episode_scripts USING btree (status);


--
-- Name: idx_image_assets_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_assets_project_id ON public.image_assets USING btree (project_id);


--
-- Name: idx_image_assets_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_assets_type ON public.image_assets USING btree (type);


--
-- Name: idx_item_bindings_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_bindings_project_id ON public.item_bindings USING btree (project_id);


--
-- Name: idx_kb_chunks_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_chunks_document_id ON public.kb_chunks USING btree (document_id);


--
-- Name: idx_kb_chunks_knowledge_base_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_chunks_knowledge_base_id ON public.kb_chunks USING btree (knowledge_base_id);


--
-- Name: idx_kb_documents_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_documents_created_at ON public.kb_documents USING btree (created_at);


--
-- Name: idx_kb_documents_knowledge_base_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_documents_knowledge_base_id ON public.kb_documents USING btree (knowledge_base_id);


--
-- Name: idx_kb_documents_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_documents_source ON public.kb_documents USING btree (knowledge_base_id, source_type, source_id);


--
-- Name: idx_kb_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_documents_status ON public.kb_documents USING btree (status);


--
-- Name: idx_kb_inverted_index_chunk_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_inverted_index_chunk_id ON public.kb_inverted_index USING btree (chunk_id);


--
-- Name: idx_kb_inverted_index_term; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_inverted_index_term ON public.kb_inverted_index USING btree (term);


--
-- Name: idx_kb_vectors_chunk_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_kb_vectors_chunk_id_unique ON public.kb_vectors USING btree (chunk_id);


--
-- Name: idx_kb_vectors_kb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_vectors_kb ON public.kb_vectors USING btree (knowledge_base_id);


--
-- Name: idx_keyframe_storyboard; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_keyframe_storyboard ON public.storyboard_keyframe USING btree (storyboard_id);


--
-- Name: idx_keyframe_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_keyframe_user_id ON public.storyboard_keyframe USING btree (user_id);


--
-- Name: idx_knowledge_bases_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_bases_created_at ON public.knowledge_bases USING btree (created_at);


--
-- Name: idx_location_bindings_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_bindings_project_id ON public.location_bindings USING btree (project_id);


--
-- Name: idx_lw_chapter_summaries_chapter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_chapter_summaries_chapter ON public.lw_chapter_state_summaries USING btree (project_id, chapter_number);


--
-- Name: idx_lw_chapter_summaries_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_chapter_summaries_project ON public.lw_chapter_state_summaries USING btree (project_id);


--
-- Name: idx_lw_characters_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_characters_project_id ON public.lw_story_characters USING btree (project_id);


--
-- Name: idx_lw_conversations_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_conversations_project_id ON public.lw_design_conversations USING btree (project_id);


--
-- Name: idx_lw_design_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_design_messages_conversation ON public.lw_design_messages USING btree (conversation_id);


--
-- Name: idx_lw_dictionary_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_dictionary_category ON public.lw_dictionary USING btree (category_code);


--
-- Name: idx_lw_entity_snapshots_chapter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_entity_snapshots_chapter ON public.lw_entity_state_snapshots USING btree (project_id, chapter_number);


--
-- Name: idx_lw_entity_snapshots_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_entity_snapshots_entity ON public.lw_entity_state_snapshots USING btree (entity_type, entity_id);


--
-- Name: idx_lw_entity_snapshots_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_entity_snapshots_project ON public.lw_entity_state_snapshots USING btree (project_id);


--
-- Name: idx_lw_factions_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_factions_project_id ON public.lw_project_factions USING btree (project_id);


--
-- Name: idx_lw_factions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_factions_type ON public.lw_project_factions USING btree (faction_type);


--
-- Name: idx_lw_items_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_items_project_id ON public.lw_story_items USING btree (project_id);


--
-- Name: idx_lw_locations_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_locations_project_id ON public.lw_story_locations USING btree (project_id);


--
-- Name: idx_lw_maps_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_maps_project_id ON public.lw_project_maps USING btree (project_id);


--
-- Name: idx_lw_materials_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_materials_project_id ON public.lw_story_materials USING btree (project_id);


--
-- Name: idx_lw_memory_entities_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_memory_entities_entity ON public.lw_memory_entities USING btree (entity_type, entity_id);


--
-- Name: idx_lw_memory_entities_memory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_memory_entities_memory ON public.lw_memory_entities USING btree (memory_id);


--
-- Name: idx_lw_outline_characters_character; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_outline_characters_character ON public.lw_outline_characters USING btree (character_id);


--
-- Name: idx_lw_outline_characters_outline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_outline_characters_outline ON public.lw_outline_characters USING btree (outline_id);


--
-- Name: idx_lw_outline_items_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_outline_items_item ON public.lw_outline_items USING btree (item_id);


--
-- Name: idx_lw_outline_items_outline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_outline_items_outline ON public.lw_outline_items USING btree (outline_id);


--
-- Name: idx_lw_outline_locations_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_outline_locations_location ON public.lw_outline_locations USING btree (location_id);


--
-- Name: idx_lw_outline_locations_outline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_outline_locations_outline ON public.lw_outline_locations USING btree (outline_id);


--
-- Name: idx_lw_outlines_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_outlines_parent_id ON public.lw_story_outlines USING btree (parent_id);


--
-- Name: idx_lw_outlines_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_outlines_project_id ON public.lw_story_outlines USING btree (project_id);


--
-- Name: idx_lw_plot_characters_character; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_plot_characters_character ON public.lw_plot_characters USING btree (character_id);


--
-- Name: idx_lw_plot_characters_plot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_plot_characters_plot ON public.lw_plot_characters USING btree (plot_id);


--
-- Name: idx_lw_plot_locations_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_plot_locations_location ON public.lw_plot_locations USING btree (location_id);


--
-- Name: idx_lw_plot_locations_plot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_plot_locations_plot ON public.lw_plot_locations USING btree (plot_id);


--
-- Name: idx_lw_plots_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_plots_project_id ON public.lw_story_plots USING btree (project_id);


--
-- Name: idx_lw_project_item_levels_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_project_item_levels_project ON public.lw_project_item_levels USING btree (project_id);


--
-- Name: idx_lw_project_item_levels_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_project_item_levels_type ON public.lw_project_item_levels USING btree (item_type_code);


--
-- Name: idx_lw_project_item_types_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_project_item_types_project ON public.lw_project_item_types USING btree (project_id);


--
-- Name: idx_lw_project_skill_levels_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_project_skill_levels_project ON public.lw_project_skill_levels USING btree (project_id);


--
-- Name: idx_lw_project_skill_levels_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_project_skill_levels_type ON public.lw_project_skill_levels USING btree (skill_type_code);


--
-- Name: idx_lw_project_skill_types_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_project_skill_types_project ON public.lw_project_skill_types USING btree (project_id);


--
-- Name: idx_lw_projects_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_projects_created_at ON public.lw_projects USING btree (created_at);


--
-- Name: idx_lw_skill_characters_character; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_skill_characters_character ON public.lw_skill_characters USING btree (character_id);


--
-- Name: idx_lw_skill_characters_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_skill_characters_skill ON public.lw_skill_characters USING btree (skill_id);


--
-- Name: idx_lw_skills_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_skills_project_id ON public.lw_story_skills USING btree (project_id);


--
-- Name: idx_lw_temp_char_templates_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_temp_char_templates_type ON public.lw_temp_character_templates USING btree (type);


--
-- Name: idx_lw_temp_loc_templates_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_temp_loc_templates_type ON public.lw_temp_location_templates USING btree (type);


--
-- Name: idx_lw_versions_chapter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lw_versions_chapter_id ON public.lw_chapter_versions USING btree (chapter_id);


--
-- Name: idx_portrait_characters_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portrait_characters_created_at ON public.portrait_characters USING btree (created_at);


--
-- Name: idx_portrait_characters_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portrait_characters_project_id ON public.portrait_characters USING btree (project_id);


--
-- Name: idx_portrait_projects_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portrait_projects_created_at ON public.portrait_projects USING btree (created_at);


--
-- Name: idx_portrait_variants_character_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portrait_variants_character_id ON public.portrait_variants USING btree (character_id);


--
-- Name: idx_portrait_variants_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portrait_variants_created_at ON public.portrait_variants USING btree (created_at);


--
-- Name: idx_portrait_variants_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portrait_variants_type ON public.portrait_variants USING btree (type);


--
-- Name: idx_scene_actions_char_binding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scene_actions_char_binding ON public.scene_actions USING btree (character_binding_id);


--
-- Name: idx_scene_actions_scene_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scene_actions_scene_id ON public.scene_actions USING btree (scene_script_id);


--
-- Name: idx_scene_characters_char_binding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scene_characters_char_binding ON public.scene_characters USING btree (character_binding_id);


--
-- Name: idx_scene_dialogues_char_binding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scene_dialogues_char_binding ON public.scene_dialogues USING btree (character_binding_id);


--
-- Name: idx_scene_props_character_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scene_props_character_id ON public.scene_props USING btree (scene_character_id);


--
-- Name: idx_scene_scripts_episode_script_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scene_scripts_episode_script_id ON public.scene_scripts USING btree (episode_script_id);


--
-- Name: idx_scene_scripts_loc_binding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scene_scripts_loc_binding ON public.scene_scripts USING btree (location_binding_id);


--
-- Name: idx_scene_scripts_scene_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scene_scripts_scene_number ON public.scene_scripts USING btree (episode_script_id, scene_number);


--
-- Name: idx_search_engine_configs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_engine_configs_created_at ON public.search_engine_configs USING btree (created_at);


--
-- Name: idx_search_engine_configs_template_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_engine_configs_template_id ON public.search_engine_configs USING btree (template_id);


--
-- Name: idx_storyboards_scene_script_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_storyboards_scene_script_id ON public.storyboards USING btree (scene_script_id);


--
-- Name: idx_storyboards_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_storyboards_status ON public.storyboards USING btree (status);


--
-- Name: idx_translations_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_translations_created_at ON public.translations USING btree (created_at);


--
-- Name: idx_translations_favorite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_translations_favorite ON public.translations USING btree (favorite);


--
-- Name: idx_translations_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_translations_type ON public.translations USING btree (type);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_video_episodes_outline_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_episodes_outline_id ON public.video_episodes USING btree (outline_id);


--
-- Name: idx_video_episodes_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_episodes_project_id ON public.video_episodes USING btree (project_id);


--
-- Name: idx_video_episodes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_episodes_status ON public.video_episodes USING btree (status);


--
-- Name: idx_video_projects_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_projects_created_at ON public.video_projects USING btree (created_at);


--
-- Name: idx_video_projects_lw_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_projects_lw_project_id ON public.video_projects USING btree (long_writing_project_id);


--
-- Name: idx_video_projects_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_projects_status ON public.video_projects USING btree (status);


--
-- Name: idx_voice_records_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_records_created_at ON public.voice_records USING btree (created_at);


--
-- Name: idx_voice_records_favorite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_records_favorite ON public.voice_records USING btree (favorite);


--
-- Name: idx_voice_records_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_records_type ON public.voice_records USING btree (type);


--
-- PostgreSQL database dump complete
--


