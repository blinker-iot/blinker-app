// Deployment availability is not device capability or authorization. The
// authenticated server still owns permission, admission, and CAS decisions.
export interface DeploymentCapabilities {
  readonly notifications: boolean;
  readonly messages: boolean;
  readonly tasks: boolean;
  readonly automation: boolean;
  readonly directAccess: boolean;
  readonly directedSharing: boolean;
  readonly consoleLinks: boolean;
}

export const cloudBetaCapabilities: DeploymentCapabilities = Object.freeze({
  notifications: false, messages: false, tasks: false, automation: false,
  directAccess: false, directedSharing: false, consoleLinks: false,
});

export const localCapabilities: DeploymentCapabilities = Object.freeze({
  notifications: true, messages: true, tasks: true, automation: true,
  directAccess: true, directedSharing: true, consoleLinks: true,
});
