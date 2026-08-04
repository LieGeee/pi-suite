import type { RuntimeSkillRecord, RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import type { WorkspaceRecord } from "./desktop-state";
import { RefreshIcon } from "./icons";
import { titleCase } from "./string-utils";

interface SkillsViewProps {
  readonly workspace?: WorkspaceRecord;
  readonly runtime?: RuntimeSnapshot;
  readonly selectedSkillPath?: string;
  readonly onSelectSkill: (filePath: string) => void;
  readonly onRefresh: () => void;
  readonly onOpenSkillFolder: (filePath: string) => void;
  readonly onToggleSkill: (filePath: string, enabled: boolean) => void;
  readonly onTrySkill: (skill: RuntimeSkillRecord) => void;
}

export function SkillsView({
  workspace,
  runtime,
  selectedSkillPath,
  onSelectSkill,
  onRefresh,
  onOpenSkillFolder,
  onToggleSkill,
  onTrySkill,
}: SkillsViewProps) {
  const skills = runtime?.skills ?? [];
  const selectedSkill = skills.find((skill) => skill.filePath === selectedSkillPath) ?? skills[0];

  if (!workspace) {
    return (
      <section className="canvas canvas--empty">
        <div className="empty-panel">
          <div className="session-header__eyebrow">技能</div>
          <h1>请选择一个工作区</h1>
          <p>技能会从当前工作区以及你的用户级技能目录中自动发现。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="canvas" data-testid="skills-surface">
      <div className="conversation skills-view">
        <header className="view-header">
          <div>
            <div className="chat-header__eyebrow">技能</div>
            <h1 className="view-header__title">技能</h1>
            <p className="view-header__body">
              为 pi 增加工作区专属能力和可复用工作流。
            </p>
          </div>
          <div className="view-header__actions">
            <button className="button button--secondary" type="button" onClick={onRefresh}>
              <RefreshIcon />
              <span>刷新</span>
            </button>
            <button
              className="button button--primary"
              type="button"
              onClick={() =>
                onTrySkill({
                  name: "new-skill",
                  description: "为当前工作区创建一个新技能",
                  filePath: "",
                  baseDir: workspace.path,
                  source: "project",
                  enabled: true,
                  disableModelInvocation: false,
                  slashCommand: "/skill:new-skill",
                })
              }
            >
              新建技能
            </button>
          </div>
        </header>

        {skills.length === 0 ? (
          <div className="empty-state">
            <h2>未找到技能</h2>
            <p>刷新运行时发现结果，以加载工作区和用户级技能。</p>
          </div>
        ) : (
          <div className="skills-layout">
            <div className="skills-list">
              <div className="skills-grid">
                {skills.map((skill) => (
                  <SkillCard
                    key={skill.filePath}
                    skill={skill}
                    active={skill.filePath === selectedSkill?.filePath}
                    onSelect={() => onSelectSkill(skill.filePath)}
                  />
                ))}
              </div>
            </div>
            <div className="skill-detail">
              {selectedSkill ? (
                <>
                  <div className="skill-detail__header">
                    <div>
                      <h2>{titleCase(selectedSkill.name)}</h2>
                      <div className="skill-detail__slash">{selectedSkill.slashCommand}</div>
                    </div>
                    <span className={`skill-detail__status ${selectedSkill.enabled ? "skill-detail__status--enabled" : ""}`}>
                      {selectedSkill.enabled ? "已启用" : "已禁用"}
                    </span>
                  </div>
                  <p className="skill-detail__description">{selectedSkill.description}</p>
                  <div className="skill-detail__meta-list">
                    <div>
                      <div className="skill-detail__meta-label">来源</div>
                      <div className="skill-detail__description">{selectedSkill.source}</div>
                    </div>
                    <div>
                      <div className="skill-detail__meta-label">路径</div>
                      <div className="skill-detail__path">{selectedSkill.filePath}</div>
                    </div>
                  </div>
                  <div className="skill-detail__actions">
                    <button className="button button--secondary" type="button" onClick={() => onOpenSkillFolder(selectedSkill.filePath)}>
                      打开文件夹
                    </button>
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() => onToggleSkill(selectedSkill.filePath, !selectedSkill.enabled)}
                    >
                      {selectedSkill.enabled ? "禁用" : "启用"}
                    </button>
                    <button className="button button--primary" type="button" onClick={() => onTrySkill(selectedSkill)}>
                      试用
                    </button>
                  </div>
                </>
              ) : (
                <SkillsEmptyState message="在左侧选择一个技能查看详情。" />
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function SkillCard({
  skill,
  active,
  onSelect,
}: {
  readonly skill: RuntimeSkillRecord;
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button className={`skill-card${active ? " skill-card--active" : ""}`} type="button" onClick={onSelect}>
      <div className="skill-card__title-row">
        <span className="skill-card__title">{titleCase(skill.name)}</span>
        <span className={`skill-card__badge${skill.enabled ? " skill-card__badge--enabled" : ""}`}>
          {skill.enabled ? "已启用" : "已禁用"}
        </span>
      </div>
      <p className="skill-card__description">{skill.description}</p>
      <div className="skill-card__meta">
        <span>{skill.source}</span>
        <span>{skill.slashCommand}</span>
      </div>
    </button>
  );
}

function SkillsEmptyState({ message }: { readonly message: string }) {
  return (
    <div className="empty-state">
      <h2>未找到技能</h2>
      <p>{message}</p>
    </div>
  );
}
