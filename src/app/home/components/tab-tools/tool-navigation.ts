interface RouterLike {
  navigate(
    commands: string[],
    extras: {
      queryParams: { tab: 'tools' };
      replaceUrl: true;
    }
  ): Promise<boolean>;
}

interface NavControllerLike {
  navigateForward(route: string): Promise<boolean>;
}

export async function navigateToTool(
  router: RouterLike,
  navController: NavControllerLike,
  route: string
): Promise<void> {
  // Keep the selected tab in the current history entry so browser/native
  // back navigation restores the tools tab instead of the default device tab.
  await router.navigate(['/home'], {
    queryParams: { tab: 'tools' },
    replaceUrl: true,
  });
  await navController.navigateForward(route);
}
