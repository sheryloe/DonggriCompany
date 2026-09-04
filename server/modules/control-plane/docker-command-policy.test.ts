import { describe, expect, it } from "vitest";
import { classifyDockerCommand } from "./docker-command-policy.ts";

const READ_ONLY_COMMANDS = [
  "docker --version",
  "docker version",
  "docker info",
  "docker ps --all",
  "docker inspect bloggent-web-1",
  "docker logs --tail 100 bloggent-web-1",
  "docker stats --no-stream",
  "docker context show",
  "docker context ls",
  "docker system df --verbose",
  "docker container ls",
  "docker image inspect node:22",
  "docker network inspect bridge",
  "docker volume ls",
  "docker desktop status",
  "docker compose config --quiet",
  "docker compose -f docker-compose.yml config",
  "docker-compose -f docker-compose.yml config",
  "docker compose ps --all",
  "docker compose logs --tail 50",
] as const;

const APPROVAL_REQUIRED_COMMANDS = [
  "docker start bloggent-web-1",
  "docker stop bloggent-web-1",
  "docker restart bloggent-web-1",
  "docker kill bloggent-web-1",
  "docker rm bloggent-web-1",
  "docker run --rm node:22",
  "docker exec bloggent-web-1 node --version",
  "docker compose up -d",
  "docker compose down",
  "docker compose restart",
  "docker compose -f docker-compose.yml build",
  "docker-compose -f docker-compose.yml down",
  "docker system prune",
  "docker volume rm app-data",
  "docker context use desktop-linux",
  "docker desktop start",
  "docker desktop quit",
  'Start-Process "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"',
  'Stop-Process -Name "Docker Desktop"',
  "Restart-Service com.docker.service",
  'taskkill /IM "Docker Desktop.exe" /F',
  "wsl --shutdown",
  "wsl.exe --terminate docker-desktop",
  'Remove-Item -LiteralPath "C:\\runtime\\docker_inference.sock"',
  'Move-Item "C:\\runtime\\docker_inference.sock" "C:\\quarantine\\docker_inference.sock"',
  "docker ps && docker restart bloggent-web-1",
] as const;

const BLOCKED_COMMANDS = [
  "",
  "docker",
  "docker help",
  "docker compose",
  "docker compose convert",
  "docker system info",
  "docker context frobnicate",
  "docker buildx bake --print",
  "docker stats",
  "docker container stats bloggent-web-1",
  "docker ps | findstr bloggent",
  "docker inspect bloggent-web-1 > state.json",
  'docker inspect "$(docker restart bloggent-web-1)"',
  "docker inspect `docker restart bloggent-web-1`",
  "Get-Process Docker",
  "Write-Output docker",
] as const;

describe("classifyDockerCommand", () => {
  it.each(READ_ONLY_COMMANDS)("allows explicit read-only command: %s", (command) => {
    expect(classifyDockerCommand(command)).toMatchObject({
      decision: "allow",
      reason_code: "DOCKER_READ_ONLY_ALLOWLIST",
      operation_class: "docker-read-only",
      required_approval: null,
    });
  });

  it.each(APPROVAL_REQUIRED_COMMANDS)("requires approval for lifecycle command: %s", (command) => {
    expect(classifyDockerCommand(command)).toMatchObject({
      decision: "approval-required",
      reason_code: "E_DOCKER_APPROVAL_REQUIRED",
      operation_class: "docker-runtime-or-host-lifecycle-change",
      required_approval: "APR-DKR-OPS-*",
    });
  });

  it.each(BLOCKED_COMMANDS)("blocks unknown or compound command: %s", (command) => {
    expect(classifyDockerCommand(command)).toMatchObject({
      decision: "block",
      reason_code: "E_DOCKER_COMMAND_BLOCKED",
      operation_class: "docker-unknown-or-compound",
      required_approval: null,
    });
  });
});
