# Daily Summary

This plugin does something which is useful but difficult to do with existing tools.
Given a search string, it will look for all sections in the vault with that string
as the title and render a list of sections, where each section has the title of the
**note** where the match was found and the body of the section that matched.

## Intended use

The idea is that you have a page for each project you're working on, with a
description of the project as the note title.  Each day, you note what you do in
a section with that day's date as the title.

Then in your daily note, you put this:

    ```daily-summary
    2024-12-12
    ```

adjusting the date as necessary.  This will find all those sections with that
heading and list their contents.

You can optionally create a note as a template that will be applied to each output
section.  One common, basic template is this:

    ## {{title}}
    {{content}}

This will render the note title with the section content.
