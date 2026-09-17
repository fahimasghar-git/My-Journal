# Plant Operations Journal workflow

- After every implemented app update, also upload the complete current source to `https://github.com/fahimasghar-git/My-Journal` and verify the remote commit.
- Preserve the repository's existing public visibility unless Fahim requests a change.
- Preserve GitHub history and update files in place. Never force-push or create duplicate nested copies of the app.
- The Sites source checkout and GitHub repository have separate histories. Use the sibling `github-upload` checkout, fetch its latest state, and synchronize the committed app source into it before committing and pushing. Preserve unrelated GitHub edits; ask if they conflict.
- Exclude passwords, access tokens, environment files, private user data, dependencies, and generated build files. Database schema and migrations belong in the source backup; live database contents do not.
- GitHub backup does not replace the normal app publication process. Report app publication and GitHub upload status separately, and report any authentication blocker honestly.
