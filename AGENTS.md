# Cavalry agent rules

## SaaS reference video intake

[`.qoder/rules/saas-video-intake.md`](.qoder/rules/saas-video-intake.md) is always on. When a chat supplies 5–10 video paths without a build request, load [`.qoder/skills/saas-reference-analyzer/SKILL.md`](.qoder/skills/saas-reference-analyzer/SKILL.md) and run the analysis-only pipeline. The skill maps styles to this repository's generated `dist/presets/preset_manifest.json`; run `npm run build:manifest` if it is missing. Never invoke `refclone` clone/build/render commands or any `stallion` command. If any input is not SaaS UI content, abort the batch and print only: "This library is SaaS-only. Remove non-SaaS video and retry."

- Never loop single-action MCP or HTTP calls. Batch scene work into one `cavalry_run_script` or `node bin/stallion-cli.mjs -e "..."` execution.
- Always prefer `_mg.*` helpers and procedural Cavalry nodes (`duplicator`, `subMesh`, `stagger`, `noise`, `oscillator`, `magicEasing`) over per-layer keyframe spam.
- Return a compact value from scripts. Use `cavalry_inspect` for selection/root IDs; never dump the scene graph.
- When tweaking existing layers, use `const id = _mg.sel()` (`api.getSelection()[0]`) instead of querying the scene.
- Prefer `cavalry_run_preset` or `stallion -p` for standard rigs. The library has 120 presets in 14 category packs (`src/presets/packs/cat01…cat14`); discover IDs with `node bin/stallion-cli.mjs --list [category]`.
- New presets go in the matching category pack, compose shared `_rb.*` factories from `src/presets/rig_builders.ts`, and must run with default `{}` params. Add a coverage case to `test/presets/library.test.ts` when the param types or rig surface change.
- Scripts are isolated IIFEs and grouped into one Undo step. Do not add another Undo group.
- Build scenes with `cavalry_batch`, not one call per layer. Reserve `cavalry_run_script` for logic the op list cannot express.
- Render sequences with `cavalry_render_frames` (or `--render-frames`) in chunks, never a loop of single-frame calls. If a chunk times out, do not re-send it: the bridge is still running. Raise `perFrameMs`, lower `chunkFrames`, and rerun — the resume list comes from `render-progress.json`.
- Run `cavalry_probe_api` (or `--probe`) before trusting an attribute path or API name. `api.getName` does not exist, `api.getNiceName` does; text attributes are `fontSize`/`letterSpacing`/`wordSpacing`/`font`, not `text.*`. Cache the report instead of re-guessing.
- Keep `ENABLE_LEGACY_TOOLS` unset unless a client explicitly needs the original granular tools.
- Use Cavalry API methods only. Never substitute After Effects APIs; `types/cavalry.d.ts` is the local contract.

<!-- PRESET_INDEX_START -->
## Compressed Preset Catalog (120 SaaS Presets)

> **Rule**: "Browse the preset catalog first before writing _mg code. Never use raw api.create/api.set when an _mg preset exists."

Format: `id | category | requiredParams | 8-word summary`
Lazy doc discovery: `dist/presets/docs/{preset}.doc.mjs` (capped at <= 110 tokens per preset) or `cavalry_search_presets({ presetId })`.

```text
kinetic_text | typography | text | Word/character reveal via subMesh + stagger: words rise
glitch_text | typography | text | Character subMesh roughened by high-frequency noise on position
typewriter_prompt | typography | promptText | AI-style input bar with character-by-character reveal and a
highlight_pill_text | typography | text | Headline with a rounded highlight pill wiping on
ticker_marquee | typography | text | Endless-feeling horizontal ticker: a label plus star separator
bento_cards | ui_mockups | - | Stroke-and-fill bento grid whose cards spring up from
cursor_click_flow | ui_mockups | label | Pointer glides to a CTA, presses it to
toggle_switch_ui | ui_mockups | - | Pill track cross-fades from off to on while
toast_stack | ui_mockups | title | Stacked notification cards slide in vertically with a
command_palette | ui_mockups | query | Dark ⌘K palette with search row, four command
number_counter | data_viz | - | stringGenerator-driven numeric readout with prefix, suffix and decimals
bar_chart | data_viz | - | Floor-pinned bars (align y:1) grown from the baseline
radial_progress_ring | data_viz | - | Stroke-trim progress ring with round caps, a track
trend_line_graph | data_viz | - | Segment-built sparkline drawing left to right, with a
node_network_hub | data_viz | hubLabel | Central labelled hub with satellite nodes, sequentially drawn
dot_matrix_bg | polish_camera | - | Grid of dots roughened by two noise behaviours
stroke_trim_reveal | polish_camera | - | Stroke-only shape with round caps, self-drawing through an
morph_shape | polish_camera | from,to | Morph behaviour blends a source primitive into a
pulse_oscillator | polish_camera | - | Oscillator wired to a layer's position, rotation or
camera_rig_25d | polish_camera | - | Two-level camera null: noise drift on the parent
ai_token_stream | ai_agents | text | Words stream in through a subMesh stagger while
ai_thinking_shimmer | ai_agents | label | Thinking badge with a soft light band sweeping
rag_context_funnel | ai_agents | hubTitle | Document cards spiral inward from an outer ring
copilot_inline_ghost | ai_agents | typedText,ghostText | Typed code plus ghost autocomplete that firms up
magic_wand_sparkle | ai_agents | - | Radial burst of 4-point stars that inflate past
agent_step_chain | ai_agents | - | Vertical reasoning steps whose status dots light up
vector_embedding_cloud | ai_agents | - | Noise-jittered dot cloud with a glowing semantic-cluster halo
model_selector_pill | ai_agents | leftLabel,rightLabel | Segmented model switcher with a spring-loaded active pill
context_window_meter | ai_agents | - | Left-anchored token bar compressing from 95% to 5%
prompt_to_ui_wireframe | ai_agents | promptText | Prompt bar stretches, a panel unfolds, and wireframe
ide_code_diff | devtools_cli | - | Code window where removed lines collapse and added
terminal_cli_spinner | devtools_cli | command,outputText | CLI window with rotating arc spinner that resolves
json_payload_tree | devtools_cli | - | Indented key/value token pills sweeping open row by
git_branch_merge | devtools_cli | - | Feature branch draws out of main, commits pop
webhook_event_ping | devtools_cli | label | Source and target endpoint badges with a glowing
sdk_language_tabs | devtools_cli | - | Language tab bar with a sliding active underline
api_latency_race | devtools_cli | fastLabel,slowLabel | Two horizontal race bars: our endpoint snaps to
syntax_token_blocks | devtools_cli | - | Grid of multi-coloured code pills assembling with a
npm_install_progress | devtools_cli | pkgName | Terminal install with segmented progress filling to 100%
error_stack_auto_fix | devtools_cli | errorText,fixText | Red error card shakes with decaying noise, then
multiplayer_cursors | collab_presence | labelPrefix | Named pointers drift across the canvas on independent
avatar_presence_stack | collab_presence | - | Overlapping avatar rings pop in on a negative-gap
live_comment_pin | collab_presence | author,comment | A comment pin drops onto the canvas and
kanban_card_drag | collab_presence | cardTitle | A task card lifts, tilts -3 degrees and
mention_tag_popover | collab_presence | handle | Typing @team pops an autocomplete people menu anchored
reaction_emoji_burst | collab_presence | - | A lively line of glowing reaction stars rises
shared_selection_box | collab_presence | userLabel | A dashed marquee drags open from its top-left
version_history_scrub | collab_presence | - | A playhead scrubs a tick-marked timeline while the
typing_indicator_dots | collab_presence | - | A chat bubble with three dots bouncing in
permission_share_modal | collab_presence | urlText | Share dialog with a public-link toggle that springs
trigger_action_flow | workflows_nodes | triggerText,actionText | Three automation cards connected by wires that draw
conditional_branch_router | workflows_nodes | conditionLabel | An If/Else diamond routes a packet down the
data_packet_conveyor | workflows_nodes | - | Capsules stream along a conveyor and pass through
webhook_retry_loop | workflows_nodes | - | A failed delivery retries along a dashed loop
cron_schedule_clock | workflows_nodes | label | Clock hands spin through scheduled cycles while sonar
schema_field_mapper | workflows_nodes | - | Source and warehouse tables connected by staggered field
batch_queue_processor | workflows_nodes | - | A queue grid drains card by card while
api_connector_plug | workflows_nodes | leftLabel,rightLabel | An app block slides into an API socket
approval_handoff | workflows_nodes | approver,actionText | A human approval card stamps Approved, then a
workflow_run_success | workflows_nodes | - | Five pipeline steps light up in sequence, checks
payment_card_checkout | fintech_billing | amount,cardLast4 | A checkout sheet springs in with a credit
subscription_tier_cards | fintech_billing | - | Three pricing tiers rise in sequence, feature checks
revenue_growth_dashboard | fintech_billing | mrr,subs,churn | Three KPI tiles pop above a revenue chart
invoice_generation | fintech_billing | invoiceNo,client | An invoice sheet builds line by line, totals
wallet_balance_card | fintech_billing | - | A premium wallet card springs in, its balance
transaction_feed | fintech_billing | - | A finance feed streams merchant rows into place
split_bill_pay | fintech_billing | total | Four friends split a dinner bill
crypto_price_ticker | fintech_billing | pair | A dark trading panel draws candlesticks one by
payout_success_burst | fintech_billing | amount,recipient | A payout lands: sonar rings radiate from a
pricing_toggle_billing | fintech_billing | - | A monthly/yearly switch slides across, the price rolls
login_auth_card | security_auth | email | A polished sign-in card assembles field by field
password_strength_meter | security_auth | - | Masked password characters tick in, the strength meter
two_factor_code | security_auth | code | Six OTP cells fill one digit at a
biometric_face_scan | security_auth | - | A phone face-scan reticle draws, a scan line
sso_redirect_flow | security_auth | provider | An app hands off to an identity provider
permission_scope_dialog | security_auth | appName | An OAuth consent sheet lists requested scopes
encrypted_data_lock | security_auth | cipher | Ciphertext rows stream past as a padlock body
threat_blocked_alert | security_auth | ip | A red threat card shakes in while a
session_timeout_clock | security_auth | - | A countdown ring drains from 60 to zero
audit_log_stream | security_auth | - | Audit entries stream into a live console with
deploy_pipeline | cloud_devops | branch | Four pipeline stages spin, check off and feed
server_rack_scale | cloud_devops | - | Server racks boot with blinking LEDs as an
container_orchestration | cloud_devops | - | A scheduler hub spins up replicas around it
cloud_cost_meter | cloud_devops | - | Cloud spend rolls up against a budget with
uptime_status_board | cloud_devops | - | A status page banner reassures, service rows resolve
load_balancer_split | cloud_devops | - | Incoming requests fan out across three healthy nodes
autoscaling_chart | cloud_devops | - | A load curve breaches the threshold, triggers a
region_map_pings | cloud_devops | - | A dotted world map lights up edge regions
kubernetes_pod_restart | cloud_devops | - | A crashing pod shakes, spins through restarts and
zero_downtime_switch | cloud_devops | blueVersion,greenVersion | Traffic shifts from blue to green with a
voice_waveform_listen | voice_audio_video | - | A mic orb pulses with sonar rings while
transcription_stream | voice_audio_video | - | A live transcript writes in line by line
audio_player_widget | voice_audio_video | trackTitle,artist | A music player card springs in with abstract
podcast_episode_card | voice_audio_video | guest | An episode card assembles with cover art, guest
video_call_grid | voice_audio_video | meeting | A four-up video call pops in, the active
screen_share_focus | voice_audio_video | shareTitle | A shared screen grows to center stage while
live_stream_badge | voice_audio_video | - | A live stream frame frames a pulsing LIVE
voice_note_bubble | voice_audio_video | duration | A voice note bubble slides in with a
sound_equalizer_bars | voice_audio_video | - | A wide spectrum equalizer pulses with preset pills
subtitle_caption_roller | voice_audio_video | sentence,speaker | A cinematic frame settles as lower-third caption words
welcome_modal | onboarding_plg | brand,headline,ctaText | A first-run welcome modal springs over a dimmed
step_progress_onboarding | onboarding_plg | heading,ctaText | A four-step setup stepper draws its connector, pops
feature_tour_spotlight | onboarding_plg | stepTitle | The dashboard dims, a spotlight ring draws around
checklist_activation | onboarding_plg | heading,ctaText | An activation checklist checks tasks off with strike-throughs
empty_state_invite | onboarding_plg | heading,ctaText | A dashed empty-state frame builds its skeleton rows
template_picker | onboarding_plg | heading,ctaText | A two-by-two template gallery pops in card by
sample_data_import | onboarding_plg | fileName | A CSV import card animates its progress to
invite_team_modal | onboarding_plg | workspace | An invite modal springs over a backdrop while
aha_moment_confetti | onboarding_plg | headline | A first-insight card counts revenue up as its
trial_countdown_banner | onboarding_plg | plan | A trial banner drops in, its day counter
logo_cloud | social_proof_cta | heading | A two-row customer logo wall springs in pill
testimonial_card | social_proof_cta | name,role,company | A quote card assembles its stars, three quote
rating_summary | social_proof_cta | rating | A big 4
customer_counter | social_proof_cta | heading | A headline number counts up to twelve thousand
press_quote_marquee | social_proof_cta | heading | Two rows of press quote cards glide in
case_study_stat | social_proof_cta | company,label | A customer quote and a 3
cta_button_pulse | social_proof_cta | ctaText | A primary CTA fires looping outline pulses while
final_cta_statement | social_proof_cta | lineOne,lineTwo,ctaText | A two-line hero statement lands with an underline
trust_badges_row | social_proof_cta | heading | Four compliance badge cards pop in a row
signup_conversion_flow | social_proof_cta | - | A four-stage funnel fills its visitor, signup, activation
```
<!-- PRESET_INDEX_END -->
