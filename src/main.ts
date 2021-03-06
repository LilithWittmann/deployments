import * as core from "@actions/core";
import * as github from "@actions/github";

import deactivateEnvironment from './deactivate';

async function run() {
  try {
    const { repo, ref, sha } = github.context;

    const token = core.getInput('token', { required: true });
    const step = core.getInput('step', { required: true });
    const logsURL = core.getInput('logs');
    const description = core.getInput('desc');
    let user_ref = core.getInput('ref')
    if (!user_ref) {
      user_ref = ref
    }
    const client = new github.GitHub(token, {
      previews: ['ant-man-preview', 'flash-preview'],
    });
    switch (step) {
    case 'start':
      {
        const environment = core.getInput('env', { required: true });
        const noOverride = core.getInput('no_override') === 'true';
        console.log(`initializing deployment for ${environment}`);

        // mark existing deployments of this environment as inactive
        if (!noOverride) {
          await deactivateEnvironment(client, repo, environment);
        }

        const transient = core.getInput('transient', { required: false }) === 'true';
        const deployment = await client.repos.createDeployment({
          owner: repo.owner,
          repo: repo.repo,
          ref: user_ref,
          required_contexts: [],
          environment,
          auto_merge: false,
          transient_environment: transient,
        });

        const deploymentID = deployment.data.id.toString();
        console.log(`created deployment ${deploymentID} for env ${environment}`);
        core.setOutput('deployment_id', deploymentID);
        core.setOutput('env', environment);
    
        await client.repos.createDeploymentStatus({
          ...repo,
          deployment_id: deployment.data.id,
          state: 'in_progress',
          log_url: logsURL || `https://github.com/${repo.owner}/${repo.repo}/commit/${sha}/checks`,
          description,
        });

        console.log('deployment status set to "in_progress"');
      }
      break;

    case 'finish':
      {
        const deploymentID = core.getInput('deployment_id', { required: true });
        const envURL = core.getInput('env_url', { required: true });
        const status = core.getInput('status', { required: true }).toLowerCase();
        if (status !== 'success' && status !== 'failure' && status !== 'cancelled') {
          core.error(`unexpected status ${status}`);
          return;
        }
        console.log(`finishing deployment for ${deploymentID} with status ${status}`);

        const newStatus = (status === 'cancelled') ? 'inactive' : status;
        await client.repos.createDeploymentStatus({
          ...repo,
          deployment_id: parseInt(deploymentID, 10),
          state: newStatus,
          description,

          // only set environment_url if deployment worked
          environment_url: (newStatus === 'success') ? envURL : '',
          // set log_url to action by default
          log_url: logsURL || `https://github.com/${repo.owner}/${repo.repo}/commit/${sha}/checks`,
        });

        console.log(`${deploymentID} status set to ${newStatus}`);
      }
      break;

    case 'deactivate-env':
      {
        const environment = core.getInput('env', { required: true });

        await deactivateEnvironment(client, repo, environment);
      }
      break;

    default:
      core.setFailed(`unknown step type ${step}`);
    }
  } catch (error) {
    core.setFailed(`unexpected error encounterd: ${error.message}`);
  }
}

run();
