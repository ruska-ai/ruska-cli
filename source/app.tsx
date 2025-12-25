import React, {useState, type PropsWithChildren} from 'react';
import {Text, useApp, Box} from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import SelectInput from 'ink-select-input';
import {type Item} from '../node_modules/ink-select-input/build/SelectInput.js';

function MainLayout({children}: PropsWithChildren) {
	return <Box>{children}</Box>;
}

type SideBarProps = {
	readonly navItems: Array<Item<string>>;
	readonly onSelect: (item: Item<string>) => void;
};

function SideBar({navItems, onSelect}: SideBarProps) {
	return (
		<Box
			borderStyle="single"
			height="100%"
			width={40}
			paddingTop={1}
			paddingBottom={1}
			paddingLeft={2}
			paddingRight={2}
		>
			<SelectInput items={navItems} onSelect={onSelect} />
		</Box>
	);
}

export function ContentPaneOne() {
	return (
		<Box
			borderStyle="single"
			height="100%"
			width="100%"
			flexDirection="column"
			paddingLeft={4}
			paddingRight={4}
		>
			<Gradient name="retro">
				<BigText text="Pane 1" />
			</Gradient>
			<Text>I&apos;m the first content area</Text>
		</Box>
	);
}

export function ContentPaneTwo() {
	return (
		<Box
			borderStyle="single"
			height="100%"
			width="100%"
			flexDirection="column"
			paddingLeft={4}
			paddingRight={4}
		>
			<Gradient name="rainbow">
				<BigText text="Pane 2" />
			</Gradient>
			<Text>I&apos;m the second content area</Text>
		</Box>
	);
}

const navItems: Array<Item<string>> = [
	{label: 'Pane 1', value: 'pane_one'},
	{label: 'Pane 2', value: 'pane_two'},
	{label: 'Exit', value: 'exit'},
];

export default function App() {
	const [currentNavItem, setCurrentNavItem] = useState(navItems[0]);
	const {exit} = useApp();

	const onNavItemSelected = (item: Item<string>) => {
		if (item.value === 'exit') {
			exit();
		} else {
			setCurrentNavItem(item);
		}
	};

	return (
		<MainLayout>
			<SideBar navItems={navItems} onSelect={onNavItemSelected} />
			{currentNavItem?.value === 'pane_one' && <ContentPaneOne />}
			{currentNavItem?.value === 'pane_two' && <ContentPaneTwo />}
		</MainLayout>
	);
}
