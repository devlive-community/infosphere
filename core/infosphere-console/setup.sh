#!/bin/bash
echo "========== Running setup script =========="

echo "Installing Shadcn Vue component"
yes | npx shadcn-vue@latest add button
yes | npx shadcn-vue@latest add label
yes | npx shadcn-vue@latest add input
yes | npx shadcn-vue@latest add form
yes | npx shadcn-vue@latest add toast
yes | npx shadcn-vue@latest add alert
yes | npx shadcn-vue@latest add dropdown-menu
yes | npx shadcn-vue@latest add separator
yes | npx shadcn-vue@latest add textarea
yes | npx shadcn-vue@latest add switch
yes | npx shadcn-vue@latest add radio-group

echo "========== Done setup script =========="
