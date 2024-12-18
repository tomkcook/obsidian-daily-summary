import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	MarkdownPostProcessorContext,
	MarkdownRenderer,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	PopoverSuggest,
	Setting,
	SuggestModal,
	TFile,
} from "obsidian";

interface DailySummarySettings {
	template: TFile | null;
	searchFolder: string | null;
	searchTag: string | null;
}

const DEFAULT_SETTINGS: DailySummarySettings = {
	template: null,
	searchFolder: "/",
	searchTag: null,
};

interface SummarySection {
	level: number;
	title: string;
	content: string;
}

class DailySummarySettingTab extends PluginSettingTab {
	plugin: DailySummaryPlugin;
	suggest?: NotePathSuggest;

	constructor(app: App, plugin: DailySummaryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Template")
			.setDesc("The template used to render summary sections")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "");
				for (const file of this.app.vault.getFiles()) {
					dropdown.addOption(file.path, file.path.replace(/\.md$/, ""));
				}
				dropdown.setValue(this.plugin.settings.template?.path ?? "");
				dropdown.onChange(async (value) => {
					this.plugin.settings.template = this.app.vault.getFileByPath(value);
					await this.plugin.saveSettings();
					this.display();
				})
			});

		new Setting(containerEl)
			.setName("Search Folders")
			.setDesc("A folder to seach for matching summary sections")
			.addText((text) => {
				text
					.setPlaceholder("Search folder")
					.setValue(this.plugin.settings.searchFolder ?? "/")
					.onChange(async (value) => {
						this.plugin.settings.searchFolder = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Search Tag")
			.setDesc("A tag to search for matching summary sections")
			.addText((text) => {
				text
					.setPlaceholder("Search tag")
					.setValue(this.plugin.settings.searchTag ?? "")
					.onChange(async (value) => {
						this.plugin.settings.searchTag = value;
						await this.plugin.saveSettings();
					});
			})
	}
}

class NotePathSuggest extends EditorSuggest<TFile> {
    constructor(app: App, inputEl: HTMLInputElement) {
        super(app);
		console.log("Constructed");
        this.inputEl = inputEl;

    }

	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
		console.log("onTritter");
        if (this.inputEl !== this.inputEl.doc.activeElement) {
            return null;
        }

        const currentInput = this.inputEl.value;
        return {
            start: { line: 0, ch: 0 }, // Doesn't matter for settings tab
            end: { line: 0, ch: currentInput.length },
            query: currentInput,
        };
	}

    getSuggestions(ctx: EditorSuggestContext): TFile[] {
		console.log("Getting suggestions");
        const allFiles = this.app.vault.getMarkdownFiles();
        return allFiles.filter(file => file.path.toLowerCase().startsWith(ctx.query.toLowerCase()));
    }

    renderSuggestion(file: TFile, el: HTMLElement) {
        el.createEl('div', { text: file.path });
    }

	selectSuggestion(value: TFile, evt: MouseEvent | KeyboardEvent): void {
        this.inputEl.value = value.path;
        this.inputEl.dispatchEvent(new Event('input')); // Trigger onChange in settings tab
	}

    inputEl: HTMLInputElement;
}

function parseMarkdownSections(markdown: string): SummarySection[] {
	const sections: SummarySection[] = [];
	const lines = markdown.split("\n");
	let currentSection: SummarySection | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const headingMatch = line.match(/^(#+)\s+(.+)$/);

		if (headingMatch) {
			const level = headingMatch[1].length;
			const title = headingMatch[2].trim();
			console.log(title);

			if (currentSection) {
				sections.push(currentSection);
			}

			currentSection = {
				level,
				title,
				content: "",
			};
		} else if (currentSection) {
			currentSection.content += line + "\n";
		}
	}

	if (currentSection) {
		sections.push(currentSection);
	}

	//Post Processing to include subsections in parent sections.
	for (let i = sections.length - 1; i >= 0; i--) {
		const current = sections[i];
		for (let j = i + 1; j < sections.length; j++) {
			const next = sections[j];
			if (next.level > current.level) {
				current.content += `\n${next.title}\n${next.content}`;
				sections.splice(j, 1);
				j--;
			} else {
				break;
			}
		}
	}

	return sections;
}

export default class DailySummaryPlugin extends Plugin {
	settings: DailySummarySettings;

	async onload() {
		console.log("Loading plugin");
		await this.loadSettings();

		this.addSettingTab(new DailySummarySettingTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor(
			"daily-summary",
			(source, el, ctx) => this.codeBlockProcessor(source, el, ctx)
		);
	}

	async onunload() {}

	async codeBlockProcessor(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	) {
		const sectionTitle = source.trim();
		const filesInPath = this.app.vault
			.getMarkdownFiles()
			.filter(
				(file) =>
					file.path.startsWith(this.settings.searchFolder ?? "")
					&& file.path != ctx.sourcePath
			);

		const outputSections: SummarySection[] = [];
		for (const file of filesInPath) {
			const content = await this.app.vault.read(file);
			const sections = parseMarkdownSections(content).filter(
				(section) => section.title == sectionTitle
			);
			outputSections.push(...sections);
		}

		const content = await this.applyTemplate(outputSections);
		await MarkdownRenderer.render(
			this.app,
			content.join("\n"),
			el,
			"",
			this
		);
		/*
		await MarkdownRenderer.render(
			this.app,
			this.app.vault.getFiles().map((file) => file.path).join("\n"),
			el,
			"",
			this
		)
		*/
	}

	async applyTemplate(sections: SummarySection[]): Promise<string[]> {
		if (this.settings.template) {
			const templateText = await this.app.vault.read(this.settings.template);
			if (! templateText) {
				return ["Failed to load template"];
			}

			return sections.map((section) => templateText.replace("{{title}}", `${section.title}`).replace("{{content}}", section.content));
		}
		return sections.map((section) => section.content);
	}

	async loadSettings() {
		let settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
		console.log(this.app.vault.getFileByPath(settings.template));
		this.settings = {...settings, template: this.app.vault.getFileByPath(settings.template)}
	}

	async saveSettings() {
		await this.saveData({...this.settings, template: this.settings.template?.path});
	}
}

